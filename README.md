# NestJS E-commerce Backend

A backend for an e-commerce system with async order processing, built on NestJS + RabbitMQ + PostgreSQL.

Orders are accepted instantly and processed in background — stock validation, price calculation, and status updates all happen asynchronously through a message queue.

## Tech Stack

- **NestJS + TypeScript** — backend framework
- **PostgreSQL** — database (runs in Docker)
- **TypeORM** — ORM + migrations
- **RabbitMQ** — message broker for async order processing
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

**Production-like mode:**
```bash
docker compose up -d
```

### Step 6: Verify

```bash
curl http://localhost:8080/graphql -X POST \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{__typename}\"}"
```

Expected: `{"data":{"__typename":"Query"}}`

### Useful URLs

| What | URL | Credentials |
|------|-----|-------------|
| API | http://localhost:8080 | — |
| GraphQL playground | http://localhost:8080/graphql | — |
| RabbitMQ Management | http://localhost:15672 | guest / guest |
| MinIO console | http://localhost:9001 | minioadmin / minioadmin |
| Adminer (DB viewer) | http://localhost:8081 | appuser / apppassword |

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

### Order Processing Flow

```
Client                    API                      DB                   RabbitMQ            Worker
  │                        │                       │                      │                   │
  │── POST /orders ──────> │                       │                      │                   │
  │                        │── BEGIN TX ─────────>│                       │                   │
  │                        │   save order (PENDING)│                      │                   │
  │                        │   save order_items    │                      │                   │
  │                        │   save outbox_message │                      │                   │
  │                        │── COMMIT ───────────> │                      │                   │
  │<── 201 Created ─────── │                       │                      │                   │
  │    (status: pending)   │                       │                      │                   │
  │                        │                       │                      │                   │
  │                   [Outbox Relay - every 5s]    │                      │                   │
  │                        │── SELECT pending ───> │                      │                   │
  │                        │<── outbox messages ── │                      │                   │
  │                        │── publish ──────────────────────────────────>│                   │
  │                        │── UPDATE sent ──────> │                      │                   │
  │                        │                       │                      │── deliver ──────> │
  │                        │                       │                      │                   │── idempotency check
  │                        │                       │                      │                   │── lock products
  │                        │                       │                      │                   │── validate stock
  │                        │                       │                      │                   │── deduct stock
  │                        │                       │                      │                   │── calculate total
  │                        │                       │                      │                   │── order → PROCESSED
  │                        │                       │                      │<── ack ────────── │
```

The API responds in milliseconds. Heavy processing (stock checks, price calculations, external service calls) happens asynchronously in the worker.

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

| Component | Type | Purpose |
|-----------|------|---------|
| `orders.exchange` | direct exchange | Routes messages by routing key |
| `orders.process` | durable queue | Main work queue — worker picks up orders here |
| `orders.dlq` | durable queue | Dead letters — messages that exhausted all retries |

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
8. Update order: `status=PROCESSED`, set `total` and `processedAt`
9. Commit transaction
10. Ack message

If anything fails between steps 3–9, the transaction rolls back and the retry mechanism kicks in.

---

## Project Structure

```
src/
├── rabbitmq/
│   ├── rabbitmq.module.ts            # Global module
│   ├── rabbitmq.service.ts           # Connection, topology setup, publish/consume/ack
│   └── rabbitmq.constants.ts         # Exchange name, queue names, MAX_RETRIES
├── worker/
│   ├── worker.module.ts
│   ├── order.worker.ts               # Consumes orders.process, does the heavy lifting
│   └── processed-message.entity.ts   # Idempotency tracking
├── outbox/
│   ├── outbox.module.ts
│   ├── outbox-message.entity.ts
│   ├── outbox-status.enum.ts
│   └── outbox-relay.service.ts       # Polls DB, publishes to RabbitMQ
├── orders/
│   ├── orders.module.ts
│   ├── orders.controller.ts
│   ├── orders.service.ts             # Creates order + outbox msg in one transaction
│   ├── orders.resolver.ts            # GraphQL
│   ├── order.entity.ts
│   └── dto/
│       ├── create-order.dto.ts
│       └── order-status.enum.ts
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
└── database/
    ├── data-source.ts
    ├── run-migrations.ts
    └── migrations/
```

## Database Schema

### orders

| Column | Type | Notes |
|--------|------|-------|
| id | serial | PK |
| idempotencyKey | varchar | unique — prevents duplicate orders |
| total | decimal(10,2) | 0 until worker calculates it |
| status | varchar | `pending` → `processed` or `failed` |
| processedAt | timestamp | null until worker processes it |
| userId | int | FK → users |
| createdAt | timestamp | auto |
| updatedAt | timestamp | auto |

### order_items

| Column | Type | Notes |
|--------|------|-------|
| id | serial | PK |
| orderId | int | FK → orders |
| productId | int | FK → products |
| quantity | int | — |
| price | decimal(10,2) | 0 until worker sets it |

### processed_messages

| Column | Type | Notes |
|--------|------|-------|
| messageId | uuid | PK — unique constraint prevents double processing |
| orderId | int | — |
| handler | varchar | e.g. "OrderWorker" |
| processedAt | timestamp | auto |

### outbox_messages

| Column | Type | Notes |
|--------|------|-------|
| id | serial | PK |
| exchange | varchar | target exchange |
| routingKey | varchar | e.g. "process" |
| payload | jsonb | message content |
| status | varchar | `pending` → `sent` |
| createdAt | timestamp | auto |
| sentAt | timestamp | null until published |

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

| Target | Base Image | Used by |
|--------|-----------|---------|
| `dev` | node:22-alpine | compose.dev.yml (hot reload) |
| `build` | node:22-alpine | intermediate build stage |
| `prod` | node:22-alpine | migrate, seed |
| `prod-distroless` | gcr.io/distroless/nodejs22-debian12 | api in production |

### Services

| Service | Image | Ports | Notes |
|---------|-------|-------|-------|
| postgres | postgres:17-alpine | internal only | healthcheck, persistent volume |
| rabbitmq | rabbitmq:4-management-alpine | 5672, 15672 | AMQP + Management UI |
| api | prod-distroless | 8080→3000 | depends on postgres + rabbitmq |
| migrate | prod | — | one-off, runs migrations |
| seed | prod | — | one-off, seeds test data |
| minio | minio/minio | 9001, 9002 | S3-compatible storage |
| adminer | adminer | 8081 | DB viewer (tools profile) |

### Dev mode

`compose.dev.yml` overrides the api service:
- Builds from `dev` target instead of `prod-distroless`
- Bind-mounts `./src` — local edits trigger recompilation
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
- Distroless production image has no shell, no package manager