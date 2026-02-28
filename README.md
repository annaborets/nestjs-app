# NestJS E-commerce Backend

A backend for an e-commerce system with proper transaction handling, prevention of duplicate orders, and protection against overselling.

## Tech Stack

- **NestJS + TypeScript** - backend framework
- **PostgreSQL** - database (runs in Docker)
- **TypeORM** - ORM + migrations
- **GraphQL** - API layer
- **JWT** - authentication
- **MinIO** - S3-compatible file storage
- **Docker** - everything runs in containers

## Getting Started

You need **Docker Desktop** installed.

### Step 1: Clone and configure

```bash
git clone <repo-url>
cd nestjs-app
cp .env.example .env.local
```

The defaults in `.env.example` work out of the box. No need to change anything for local development.

### Step 2: Start the database

```bash
docker compose up postgres -d
```

Wait a few seconds until postgres is healthy.

### Step 3: Create tables

```bash
docker compose run --rm migrate
```

This runs all migrations and exits. You'll see output like:
```
Running migrations...
query: CREATE TABLE "users" (...)
query: CREATE TABLE "orders" (...)
query: CREATE TABLE "products" (...)
...
Migrations completed successfully
```

### Step 4: Add test data

```bash
docker compose run --rm seed
```

Creates an admin user and 5 sample products:
```
Admin user created
Created 5 products
Seeding completed!
```

### Step 5: Start the API

**Production-like mode:**
```bash
docker compose up -d
```

**Development mode (hot reload):**
```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

In dev mode, edit any file in `src/` — the app recompiles automatically inside the container.

### Step 6: Check it works

```bash
curl http://localhost:8080/graphql -X POST -H "Content-Type: application/json" -d "{\"query\":\"{__typename}\"}"
```

You should get:
```json
{"data":{"__typename":"Query"}}
```

### Useful URLs

| What | URL |
|------|-----|
| API | http://localhost:8080 |
| GraphQL playground | http://localhost:8080/graphql |
| MinIO console | http://localhost:9001 |
| Adminer (DB viewer) | http://localhost:8081 (see below) |

### View the database

```bash
docker compose --profile tools up adminer -d
```

Go to http://localhost:8081, log in with: server `postgres`, user `appuser`, password `apppassword`, database `appdb`.

### Stop everything

```bash
docker compose down
```

Add `-v` to also delete the database data:
```bash
docker compose down -v
```

---

## Docker Architecture

### Files added for Docker

```
├── Dockerfile              # Multi-stage: dev, build, prod, prod-distroless
├── compose.yml             # Prod-like stack: api + postgres + migrate + seed + minio
├── compose.dev.yml         # Dev override: hot reload with bind-mount
├── .dockerignore           # Excludes node_modules, .env, .git from build context
├── .env.example            # Template for environment variables
└── src/database/
    ├── data-source.ts      # Standalone TypeORM DataSource for migrations CLI
    ├── run-migrations.ts   # Migration runner for Docker container
    └── migrations/         # Generated migration files
```

### Dockerfile targets

| Target | Base Image | What's inside | Used by |
|--------|-----------|---------------|---------|
| `dev` | node:22-alpine | Full source + all deps | compose.dev.yml |
| `build` | node:22-alpine | Compiles TS → JS | intermediate, not run |
| `prod` | node:22-alpine | dist/ + prod deps only | migrate, seed |
| `prod-distroless` | gcr.io/distroless/nodejs22-debian12 | dist/ + prod deps, no shell | api in compose.yml |

### How compose.yml is organized

- **postgres** — internal network only, no exposed ports, healthcheck, persistent volume
- **api** — built from prod-distroless, maps 8080→3000, depends on healthy postgres
- **migrate** — one-off job, runs migrations and exits (profile: tools)
- **seed** — one-off job, seeds data and exits (profile: tools)
- **minio + minio-init** — S3-compatible storage for file uploads
- **adminer** — database UI (profile: tools)

Networks: `internal` (all services) + `public` (only api and adminer — they need to be reachable from your browser).

### How dev mode works

`compose.dev.yml` overrides the api service:
- Builds from `dev` target instead of `prod-distroless`
- Bind-mounts `./src` into the container — your local edits go straight in
- Anonymous volume for `node_modules` — prevents the mount from overwriting installed packages
- Polling enabled for file watching (needed on Windows + Docker)

---

## Proofs

### Image sizes

Actual output from `docker image ls`:

```
IMAGE                    SIZE
nestjs-dev               197MB
nestjs-prod              104MB
nestjs-distroless        74.7MB
```

Distroless is ~28% smaller than prod Alpine. It has no shell, no package manager, no OS tools — just the Node.js runtime.

### Docker history (prod image layers)

```
$ docker history nestjs-prod
SIZE      CREATED BY
0B        CMD ["node" "dist/main.js"]
0B        EXPOSE [3000/tcp]
0B        USER node
1.37MB    COPY /usr/src/app/dist ./dist
233MB     RUN /bin/sh -c npm ci --omit=dev
528kB     COPY package.json package-lock.json* ./
16.4kB    WORKDIR /usr/src/app
```

The biggest layer is `npm ci --omit=dev` (233MB — production dependencies). The compiled app itself (`dist/`) is only 1.37MB.

### Non-root proof

**prod containers (Alpine):**
```
$ docker compose run --rm --entrypoint sh seed -c "whoami"
node
```

File ownership inside container:
```
$ docker compose run --rm --entrypoint sh seed -c "ls -la /usr/src/app/"
drwxr-xr-x    1 node     node          4096 Feb 28 13:06 .
drwxr-xr-x    1 node     node          4096 Feb 28 13:06 dist
drwxr-xr-x    1 node     node         12288 Feb 28 13:06 node_modules
```

Everything owned by `node:node`, not `root`.

**prod-distroless container (no shell, so checked from outside):**
```
$ docker top nestjs-app-api-1
UID       PID     PPID    CMD
65532     28346   28323   /nodejs/bin/node dist/main.js
```

UID 65532 = `nonroot` user in distroless. Not 0 (root).

### Postgres not exposed

```
$ docker compose ps
NAME                    IMAGE                PORTS
nestjs-app-api-1        nestjs-app-api       0.0.0.0:8080->3000/tcp
nestjs-app-postgres-1   postgres:17-alpine   5432/tcp
```

API has `0.0.0.0:8080` — accessible from your machine. Postgres has just `5432/tcp` — only reachable inside Docker's internal network.

### Clean runtime

No source code, no dev tools, no config files in production container:
```
$ docker compose run --rm --entrypoint sh seed -c "ls /usr/src/app/"
dist
node_modules
package-lock.json
package.json
```

### Migrations and seed are one-off

Both containers run their job and exit. They don't stay running. Triggered manually with:
```bash
docker compose run --rm migrate
docker compose run --rm seed
```

---

## Bonus features

- **Healthcheck for postgres** — Docker monitors if DB is accepting connections
- **Healthcheck for api** (dev mode) — Docker monitors if API responds
- **Resource limits** — api: 512MB RAM / 0.5 CPU, postgres: 256MB RAM / 0.25 CPU
- **`init: true`** on api — proper signal handling and zombie process cleanup
- **`stop_grace_period: 10s`** — graceful shutdown on `docker compose down`
- **Adminer** under `tools` profile — database UI without cluttering the main stack

---

## Business Logic

### How Order Creation Works

When someone creates an order, three things can go wrong:
- Network timeout → user clicks "buy" again → duplicate orders
- Two people buy the last item at the same time → overselling
- Something fails mid-process → partial order

Solutions:

**Transactions** — everything happens in one transaction. If anything fails, nothing gets saved.

**Idempotency** — each order needs a unique `idempotencyKey`. Same key twice = same order back, not a duplicate.

**Pessimistic locking** — when checking stock, we lock the product row in the database. No one else can buy it until we're done.

### API Examples

**Create an order:**
```bash
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

**Get products:**
```
GET http://localhost:8080/products
```

### Error Codes

- `201` - Order created
- `200` - Same idempotency key, returning existing order
- `400` - Product doesn't exist
- `409` - Not enough stock