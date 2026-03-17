# NestJS E-commerce Backend

A backend for an e-commerce system with async order processing, built on NestJS + RabbitMQ + PostgreSQL.

Orders are accepted instantly and processed in background — stock validation, price calculation, payment authorization and status updates all happen asynchronously through a message queue.

## Tech Stack

- **NestJS + TypeScript** — backend framework
- **PostgreSQL** — database (runs in Docker)
- **TypeORM** — ORM + migrations
- **RabbitMQ** — message broker for async order processing
- **gRPC** — inter-service communication (orders ↔ payments)
- **GraphQL** — API layer
- **JWT** — authentication
- **MinIO** — S3-compatible file storage
- **Docker** — everything runs in containers

## Getting Started

You need **Docker Desktop** installed.

### Step 1: Clone and configure

```bash
git clone <repo-url>
cd nestjs-app
cp .env.example .env.local
```

The defaults in `.env.example` work out of the box.

### Step 2: Start infrastructure

```bash
docker compose up postgres rabbitmq -d
```

Wait until both are healthy (RabbitMQ needs up to 60s on first start):

```bash
docker compose ps
```

Both should show `(healthy)`.

### Step 3: Create tables

```bash
docker compose run --rm migrate
```

### Step 4: Add test data

```bash
docker compose run --rm seed
```

Creates an admin user (`admin@example.com` / `Admin123!`) and 5 sample products.

### Step 5: Start the API

**Development mode (hot reload):**

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

This starts both `api` (orders-service on port 8080) and `payments` (gRPC server on port 5001, internal).

**Production-like mode (clean start):**

```bash
docker compose down -v           # remove old containers and volumes
docker compose up -d --build     # rebuild images and start fresh
```

This builds both `api` (distroless image) and `payments` (Alpine image) from scratch, ensuring the proto contract and compiled code are packaged correctly.

### Step 6: Verify

```bash
curl http://localhost:8080/graphql -X POST \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{__typename}\"}"
```

Expected: `{"data":{"__typename":"Query"}}`

Check that payments service is running:

```bash
docker compose logs payments
```

Expected: `Payments gRPC service is running on 0.0.0.0:5001`

### Useful URLs

| What                | URL                           | Credentials             |
| ------------------- | ----------------------------- | ----------------------- |
| API                 | http://localhost:8080         | —                       |
| GraphQL playground  | http://localhost:8080/graphql | —                       |
| RabbitMQ Management | http://localhost:15672        | guest / guest           |
| MinIO console       | http://localhost:9001         | minioadmin / minioadmin |
| Adminer (DB viewer) | http://localhost:8081         | appuser / apppassword   |

To start Adminer:

```bash
docker compose --profile tools up adminer -d
```

### Stop everything

```bash
docker compose down        # keep data
docker compose down -v     # delete all data
```

---

## Architecture

### Order Processing Flow (with Payments)

```
Client                API                 DB              RabbitMQ         Worker              Payments (gRPC)
  │                    │                  │                  │                │                     │
  │── POST /orders ──>│                   │                  │                │                     │
  │                    │── BEGIN TX ─────>│                  │                │                     │
  │                    │   save order     │                  │                │                     │
  │                    │   save items     │                  │                │                     │
  │                    │   save outbox    │                  │                │                     │
  │                    │── COMMIT ───────>│                  │                │                     │
  │<── 201 Created ── │                   │                  │                │                     │
  │    (pending)       │                  │                  │                │                     │
  │                    │                  │                  │                │                     │
  │               [Outbox Relay ~5s]      │                  │                │                     │
  │                    │── publish ─────────────────────────>│                │                     │
  │                    │                  │                  │── deliver ────>│                     │
  │                    │                  │                  │                │── idempotency check │
  │                    │                  │                  │                │── lock products     │
  │                    │                  │                  │                │── validate stock    │
  │                    │                  │                  │                │── deduct stock      │
  │                    │                  │                  │                │── calculate total   │
  │                    │                  │                  │                │                     │
  │                    │                  │                  │                │── Authorize ───────>│
  │                    │                  │                  │                │   (gRPC call)       │
  │                    │                  │                  │                │<── paymentId+status │
  │                    │                  │                  │                │                     │
  │                    │                  │                  │                │── order → PROCESSED │
  │                    │                  │                  │<── ack ────────│                     │
```

The API responds in milliseconds. Heavy processing (stock checks, price calculation, payment authorization) happens asynchronously in the worker.

### RabbitMQ Topology

```
                    ┌───────────────────────────────────────┐
                    │         orders.exchange (direct)      │
                    └───────┬────────────────────┬──────────┘
                            │                    │
                     routing key:          routing key:
                      "process"              "dlq"
                            │                    │
                            ▼                    ▼
                    ┌────────────────┐    ┌───────────────┐
                    │ orders.process │    │  orders.dlq   │
                    │  (durable)     │    │  (durable)    │
                    └───────┬────────┘    └───────────────┘
                            │
                            ▼
                       [ Worker ]
                      prefetch = 1
                      manual ack
```

| Component         | Type            | Purpose                                            |
| ----------------- | --------------- | -------------------------------------------------- |
| `orders.exchange` | direct exchange | Routes messages by routing key                     |
| `orders.process`  | durable queue   | Main work queue — worker picks up orders here      |
| `orders.dlq`      | durable queue   | Dead letters — messages that exhausted all retries |

You can see all of this live in RabbitMQ Management UI at http://localhost:15672.

### Retry + Dead Letter Queue

When the worker fails to process an order, it does not just drop the message. Instead:

```
attempt 0 → FAIL → republish with attempt=1, ack original
attempt 1 → FAIL → republish with attempt=2, ack original
attempt 2 → FAIL → publish to orders.dlq, mark order as FAILED, ack
```

Max retries: **3** (configurable in `rabbitmq.constants.ts`).

This is the **republish + ack** approach — the worker always acks the original message and publishes a new one with an incremented attempt counter. No infinite loops, no stuck messages. Everything either succeeds or lands in the DLQ for inspection.

### Idempotency

RabbitMQ guarantees **at-least-once delivery**. If the worker crashes after committing to the DB but before sending an ack, RabbitMQ will redeliver the message. Without protection, the order would be processed twice.

**Level 1 — HTTP (idempotencyKey)**

Each order carries a unique `idempotencyKey`. Sending the same key twice returns the existing order instead of creating a duplicate.

**Level 2 — Worker (processed_messages table)**

Every message has a unique `messageId`. When the worker starts processing, it tries to INSERT into `processed_messages`. If the messageId already exists, the unique constraint throws and the worker skips processing.

We use a raw `INSERT` query instead of TypeORM's `save()` because `save()` silently does an upsert and would never detect duplicates.

**Level 3 — Payments (idempotency key per gRPC call)**

Each `Authorize` call includes an idempotency key derived from the order: `payment-{order.idempotencyKey}`. If the same call arrives twice (e.g. after a retry), payments-service returns the existing payment instead of charging again.

### Outbox Pattern

Saving to the database and publishing to RabbitMQ are two separate operations. If one succeeds and the other fails, the system becomes inconsistent.

The outbox pattern keeps everything in the database:

1. `createOrder()` saves the order **and** an outbox message in a **single DB transaction**
2. A relay service polls the `outbox_messages` table every 5 seconds
3. For each pending message, it publishes to RabbitMQ and marks the record as `sent`

If RabbitMQ goes down, messages accumulate in the outbox and get published when it comes back.

### Worker Internals

The worker processes one message at a time (`prefetch=1`, `noAck=false`):

1. Receive message from `orders.process`
2. Parse `{ messageId, orderId, attempt }`
3. Begin DB transaction
4. Try INSERT into `processed_messages` — if duplicate, ack and skip
5. Load order (must be in PENDING status)
6. For each order item:
   - Lock the product row (`SELECT ... FOR UPDATE`)
   - Validate stock availability
   - Deduct stock
   - Set item price from current product price
7. Calculate order total
8. **Authorize payment via gRPC** (with timeout + retry)
9. Update order: `status=PROCESSED`, set `total` and `processedAt`
10. Commit transaction
11. Ack message

If anything fails between steps 3–10, the transaction rolls back and the retry mechanism kicks in.

---

## Payments Service (gRPC)

### Overview

Payments is a **separate microservice** that runs as its own process. It handles payment authorization through gRPC protocol. Orders-service communicates with it **only through the proto contract** — there are no direct code imports between services.

This separation means payments-service can be scaled, deployed, or restarted independently from the main API.

### Proto Contract

The contract is defined in `proto/payments.proto` and shared between both services. Neither service imports code from the other — they only share this `.proto` file.

```protobuf
service Payments {
  rpc Authorize (AuthorizeRequest) returns (AuthorizeResponse);
  rpc GetPaymentStatus (GetPaymentStatusRequest) returns (GetPaymentStatusResponse);
  rpc Capture (CaptureRequest) returns (CaptureResponse);       // stub
  rpc Refund (RefundRequest) returns (RefundResponse);           // stub
}
```

| RPC                | Status      | Description                                                      |
| ------------------ | ----------- | ---------------------------------------------------------------- |
| `Authorize`        | Implemented | Authorizes payment for an order, returns `paymentId` + `status`  |
| `GetPaymentStatus` | Implemented | Returns current status of a payment by `paymentId`               |
| `Capture`          | Stub        | Declared in proto, handler logs a warning and returns `CAPTURED` |
| `Refund`           | Stub        | Declared in proto, handler logs a warning and returns `REFUNDED` |

Key fields in `AuthorizeRequest`: `order_id`, `amount` (in cents, int64), `currency`, `idempotency_key`.

### How Services Connect

```
┌─────────────────────────┐         gRPC (proto contract)        ┌──────────────────────┐
│     orders-service      │ ──────────────────────────────────── │   payments-service   │
│   (api container)       │         payments:5001                │  (payments container)│
│                         │                                      │                      │
│  PaymentsClientModule   │   ← ClientsModule.registerAsync      │   PaymentsModule     │
│  PaymentsClientService  │   ← @Inject('PAYMENTS_PACKAGE')      │   PaymentsController │
│                         │   ← @GrpcMethod handlers             │   PaymentsService    │
│                         │                                      │   PaymentsStorage    │
└─────────────────────────┘                                      └──────────────────────┘
```

- `PaymentsClientModule` registers a gRPC client using `ClientsModule.registerAsync`. The URL comes from `ConfigService` (`payments.grpcUrl`), not hardcoded.
- `PaymentsClientService` wraps gRPC calls with timeout (RxJS `timeout` operator) and retry logic (RxJS `retry` operator).
- `PaymentsController` on the server side uses `@GrpcMethod('Payments', 'Authorize')` decorator to map proto RPCs to handler methods.
- `PaymentsStorage` is a simple in-memory Map that stores payments. It also maintains an index by idempotency key for duplicate detection.

### Resilience

#### Timeout (deadline)

Every gRPC call has a deadline. If payments-service does not respond in time, the call fails with a timeout error. The value is configurable and comes from NestJS ConfigService:

```
.env  →  configuration.ts  →  ConfigService  →  PaymentsClientService  →  RxJS timeout() operator
```

This is not a "for show" timeout — it actually cuts the connection. If you set `PAYMENTS_GRPC_TIMEOUT_MS=100` and payments-service has a delay, you will see `TimeoutError` in logs.

#### Retry (only transient errors)

Not every error should be retried. If payment was declined — retrying will not help. But if the network was temporarily down — it makes sense to try again.

The retry logic uses RxJS `retry` operator with a custom `delay` function:

```
call  →  timeout  →  retry({
  count: from config,
  delay: (error) => {
    if not transient → throw immediately
    if transient → wait with exponential backoff
  }
})
```

Transient gRPC codes that trigger retry:

- `UNAVAILABLE` (code 14) — service is down or network issue
- `DEADLINE_EXCEEDED` (code 4) — timeout
- `RESOURCE_EXHAUSTED` (code 8) — rate limited

Everything else (like `NOT_FOUND`, `INVALID_ARGUMENT`, `PERMISSION_DENIED`) fails immediately without retry.

Backoff is exponential: 200ms → 400ms → 800ms (base delay × 2^attempt).

#### gRPC → HTTP Error Mapping

When a gRPC error reaches the orders HTTP layer, it needs to be translated into proper HTTP status codes. Otherwise the client would see a raw 500 error with a gRPC message.

`GrpcExceptionFilter` handles this mapping:

| gRPC Status          | HTTP Status | Client sees                 |
| -------------------- | ----------- | --------------------------- |
| `NOT_FOUND`          | 404         | Payment not found           |
| `DEADLINE_EXCEEDED`  | 408         | Payment service timeout     |
| `UNAVAILABLE`        | 503         | Payment service unavailable |
| `INVALID_ARGUMENT`   | 400         | Invalid payment request     |
| `ALREADY_EXISTS`     | 409         | Payment already exists      |
| `RESOURCE_EXHAUSTED` | 429         | Payment service overloaded  |
| `PERMISSION_DENIED`  | 403         | Payment permission denied   |
| `INTERNAL`           | 500         | Payment service error       |

### Configuration

All payments-related config is in one place (`src/config/configuration.ts`) and comes from environment variables:

| Variable                       | Default        | Used by          | Description                              |
| ------------------------------ | -------------- | ---------------- | ---------------------------------------- |
| `PAYMENTS_GRPC_PORT`           | 5001           | payments-service | Port the gRPC server listens on          |
| `PAYMENTS_GRPC_URL`            | localhost:5001 | orders-service   | Where to find payments gRPC server       |
| `PAYMENTS_GRPC_TIMEOUT_MS`     | 5000           | orders-service   | Deadline for each gRPC call              |
| `PAYMENTS_GRPC_RETRY_ATTEMPTS` | 3              | orders-service   | How many times to retry transient errors |
| `PAYMENTS_GRPC_RETRY_DELAY_MS` | 200            | orders-service   | Base delay between retries (exponential) |

### Testing the Happy Path

**1. Login to get a token:**

**2. Create an order (use the access token):**

```
POST http://localhost:8080/orders
Authorization: Bearer <access_token>

{
  "userId": 1,
  "idempotencyKey": "test-grpc-001",
  "items": [
    { "productId": 1, "quantity": 1 }
  ]
}
```

**3. Immediate response (order is pending, payment not yet done):**

```json
{
  "id": 12,
  "status": "pending",
  "total": "0.00",
  "processedAt": null
}
```

**4. Check logs — you should see the full flow:**

```bash
docker compose logs -f api payments
```

```
[OrdersService]          Order 12 created (PENDING), outbox message ... saved
[RabbitmqService]        Published message with routing key: process
[OrderWorker]            Received message: messageId=..., orderId=12, attempt=0
[PaymentsClientService]  Calling Payments.Authorize: orderId=12, amount=99999 USD
[PaymentsService]        Payment authorized: paymentId=095d5b85-..., orderId=12, amount=99999 USD
[OrderWorker]            Payment authorized: paymentId=095d5b85-..., status=1
[OrderWorker]            SUCCESS: orderId=12, messageId=...
```

**5. Get the order after processing (~5-10s):**

```
GET http://localhost:8080/orders/12
Authorization: Bearer <access_token>
```

```json
{
  "id": 12,
  "status": "processed",
  "total": "999.99",
  "processedAt": "2026-03-10T10:50:44.000Z"
}
```

### Testing Idempotency

Send the same `idempotencyKey` twice:

```
POST http://localhost:8080/orders
Authorization: Bearer <access_token>

{
  "userId": 1,
  "idempotencyKey": "test-grpc-001",
  "items": [{ "productId": 1, "quantity": 1 }]
}
```

In the logs you will see:

```
[OrdersService]  Idempotency key test-grpc-001 already exists, returning existing order
```

The order is not created again. If somehow the same payment call reaches payments-service, it also detects the duplicate:

```
[PaymentsService]  Idempotent hit for key="payment-test-grpc-001", returning paymentId=...
```

### Testing Retry + Timeout (Unhappy Path)

**1. Stop the payments service:**

```bash
docker compose stop payments
```

**2. Create an order:**

```
POST http://localhost:8080/orders

{
  "userId": 1,
  "idempotencyKey": "test-timeout-001",
  "items": [{ "productId": 1, "quantity": 1 }]
}
```

**3. Watch the logs:**

```bash
docker compose logs -f api
```

You will see gRPC retries with exponential backoff:

```
[PaymentsClientService]  Calling Payments.Authorize: orderId=13, amount=99999 USD
[PaymentsClientService]  Transient gRPC error (code=14), retry 1/3 in 200ms
[PaymentsClientService]  Transient gRPC error (code=14), retry 2/3 in 400ms
[PaymentsClientService]  Transient gRPC error (code=14), retry 3/3 in 800ms
[OrderWorker]            FAILED: orderId=13, attempt=0, error=14 UNAVAILABLE: No connection established
[OrderWorker]            RETRY: orderId=13, next attempt=1
```

After all worker retries (3 attempts × 3 gRPC retries each = 9 total tries), the order goes to DLQ:

```
[OrderWorker]  DLQ: orderId=13, messageId=..., max retries reached
```

**4. Start payments back:**

```bash
docker compose start payments
```

New orders will work fine again. The failed order stays in `failed` status in the database.

---

## Project Structure

```
proto/
└── payments.proto                     # shared gRPC contract (both services use it)

src/
├── payments/                          # payments-service (separate process)
│   ├── main.ts                        # gRPC server entrypoint
│   ├── payments.module.ts
│   ├── payments.controller.ts         # @GrpcMethod handlers
│   ├── payments.service.ts            # authorize, getPaymentStatus logic
│   └── payments-storage.ts            # in-memory store with idempotency index
├── payments-client/                   # gRPC client (used inside orders-service)
│   ├── payments-client.module.ts      # registers gRPC client via ClientsModule
│   ├── payments-client.service.ts     # authorize(), getPaymentStatus() + timeout + retry
│   └── grpc-exception.filter.ts       # gRPC status → HTTP status mapping
├── rabbitmq/
│   ├── rabbitmq.module.ts
│   ├── rabbitmq.service.ts
│   └── rabbitmq.constants.ts
├── worker/
│   ├── worker.module.ts
│   ├── order.worker.ts                # calls PaymentsClientService.authorize()
│   └── processed-message.entity.ts
├── auth/
│   └── outbox/
│       ├── outbox.module.ts
│       ├── outbox-message.entity.ts
│       ├── outbox-status.enum.ts
│       └── outbox-relay.service.ts
├── orders/
│   ├── orders.module.ts
│   ├── orders.controller.ts           # @UseFilters(GrpcExceptionFilter)
│   ├── orders.service.ts
│   ├── orders.resolver.ts
│   ├── order.entity.ts
│   └── dto/
│       └── create-order.dto.ts
├── order-items/
│   └── order-item.entity.ts
├── products/
│   └── ...
├── auth/
│   └── ...
├── users/
│   └── ...
├── files/
│   └── ...
├── config/
│   └── configuration.ts               # payments config from env
└── database/
    ├── data-source.ts
    ├── run-migrations.ts
    └── migrations/
```

## Database Schema

### orders

| Column         | Type          | Notes                               |
| -------------- | ------------- | ----------------------------------- |
| id             | serial        | PK                                  |
| idempotencyKey | varchar       | unique — prevents duplicate orders  |
| total          | decimal(10,2) | 0 until worker calculates it        |
| status         | varchar       | `pending` → `processed` or `failed` |
| processedAt    | timestamp     | null until worker processes it      |
| userId         | int           | FK → users                          |
| createdAt      | timestamp     | auto                                |
| updatedAt      | timestamp     | auto                                |

### order_items

| Column    | Type          | Notes                  |
| --------- | ------------- | ---------------------- |
| id        | serial        | PK                     |
| orderId   | int           | FK → orders            |
| productId | int           | FK → products          |
| quantity  | int           | —                      |
| price     | decimal(10,2) | 0 until worker sets it |

### processed_messages

| Column      | Type      | Notes                                             |
| ----------- | --------- | ------------------------------------------------- |
| messageId   | uuid      | PK — unique constraint prevents double processing |
| orderId     | int       | —                                                 |
| handler     | varchar   | e.g. "OrderWorker"                                |
| processedAt | timestamp | auto                                              |

### outbox_messages

| Column     | Type      | Notes                |
| ---------- | --------- | -------------------- |
| id         | serial    | PK                   |
| exchange   | varchar   | target exchange      |
| routingKey | varchar   | e.g. "process"       |
| payload    | jsonb     | message content      |
| status     | varchar   | `pending` → `sent`   |
| createdAt  | timestamp | auto                 |
| sentAt     | timestamp | null until published |

---

## API

### Create an order

```
POST http://localhost:8080/orders
Content-Type: application/json

{
  "userId": 1,
  "idempotencyKey": "order-abc-123",
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
```

Immediate response:

```json
{
  "id": 1,
  "status": "pending",
  "total": "0.00",
  "processedAt": null
}
```

After worker processes (~5–10s):

```json
{
  "id": 1,
  "status": "processed",
  "total": "1999.98",
  "processedAt": "2026-03-01T14:19:16.643Z"
}
```

### Other endpoints

```
GET /orders          # list all orders
GET /orders/:id      # single order with items and product details
GET /products        # list all products
```

### Message format (RabbitMQ)

```json
{
  "messageId": "a1b2c3d4-...",
  "orderId": 1,
  "createdAt": "2026-03-01T14:00:00.000Z",
  "attempt": 0
}
```

---

## Docker Architecture

### Dockerfile targets

| Target            | Base Image                          | Used by                      |
| ----------------- | ----------------------------------- | ---------------------------- |
| `dev`             | node:22-alpine                      | compose.dev.yml (hot reload) |
| `build`           | node:22-alpine                      | intermediate build stage     |
| `prod`            | node:22-alpine                      | migrate, seed, payments      |
| `prod-distroless` | gcr.io/distroless/nodejs22-debian12 | api in production            |

### Services

| Service  | Image                        | Ports         | Notes                                     |
| -------- | ---------------------------- | ------------- | ----------------------------------------- |
| postgres | postgres:17-alpine           | internal only | healthcheck, persistent volume            |
| rabbitmq | rabbitmq:4-management-alpine | 5672, 15672   | AMQP + Management UI                      |
| api      | prod-distroless              | 8080→3000     | depends on postgres + rabbitmq + payments |
| payments | prod                         | internal:5001 | gRPC server, separate process             |
| migrate  | prod                         | —             | one-off, runs migrations                  |
| seed     | prod                         | —             | one-off, seeds test data                  |
| minio    | minio/minio                  | 9001, 9002    | S3-compatible storage                     |
| adminer  | adminer                      | 8081          | DB viewer (tools profile)                 |

### Dev mode

`compose.dev.yml` overrides the api service:

- Builds from `dev` target instead of `prod-distroless`
- Bind-mounts `./src` and `./proto` — local edits trigger recompilation
- Anonymous volume for `node_modules`
- Polling enabled for file watching (Windows + Docker)

### Image sizes

```
nestjs-dev          197MB
nestjs-prod         104MB
nestjs-distroless   74.7MB
```

### Security

- All containers run as non-root (`node` or UID 65532)
- PostgreSQL is not exposed to the host
- Payments gRPC port is internal only (not exposed to host)
- Distroless production image has no shell, no package manager