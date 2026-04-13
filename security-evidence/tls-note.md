# Transport Security / TLS Posture

## Current Architecture

```
Client (browser / mobile / curl)
    │
    │  ← HTTP (no TLS in local dev)
    │
    ▼
NestJS App (port 3000)
    │
    │  ← TLS (Neon.tech requires SSL)
    │
    ▼
PostgreSQL (Neon.tech, cloud)
    │
NestJS App ──── HTTP ────► MinIO / S3 (localhost:9002 in dev)
    │
NestJS App ──── AMQP ────► RabbitMQ (localhost:5672 in dev)
```

## TLS Termination Points

| Connection       | TLS?               | Where terminated | Notes                                                                  |
| ---------------- | ------------------ | ---------------- | ---------------------------------------------------------------------- |
| Client → App     | **No** (local dev) | N/A              | No reverse proxy configured locally                                    |
| App → PostgreSQL | **Yes**            | Neon.tech edge   | `DATABASE_SSL=true` enables SSL; currently `rejectUnauthorized: false` |
| App → MinIO/S3   | **No** (local dev) | N/A              | MinIO runs on HTTP locally                                             |
| App → RabbitMQ   | **No** (local dev) | N/A              | Default AMQP without TLS                                               |

## Traffic Classification

| Traffic type | Description                          | Current protection                              |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| **Public**   | Client → NestJS API (REST + GraphQL) | JWT auth, rate limiting, helmet headers         |
| **Internal** | App → PostgreSQL, RabbitMQ, MinIO    | Network-level isolation (Docker network in dev) |
| **Trusted**  | App → Neon.tech DB                   | TLS encrypted, but cert validation disabled     |

## Production Target State

```
Client
    │
    │  ← HTTPS (TLS 1.2+)
    │
    ▼
Reverse Proxy (nginx / Cloudflare / AWS ALB)
    │
    │  ← HTTP (internal network)
    │
    ▼
NestJS App (port 3000, private network)
    │
    │  ← TLS (with rejectUnauthorized: true)
    │
    ▼
PostgreSQL (Neon.tech / AWS RDS)
```

### What changes in production

1. **TLS termination at reverse proxy** — nginx or cloud load balancer handles HTTPS certificates (e.g., Let's Encrypt or AWS ACM)
2. **HTTP → HTTPS redirect** — enforced at the proxy level, `Strict-Transport-Security` header set by helmet
3. **`rejectUnauthorized: true`** — app validates the database server certificate against the Neon.tech CA
4. **Internal traffic stays HTTP** — app runs in a private subnet / Docker network; the reverse proxy is the only public-facing component
5. **S3 over HTTPS** — switch `S3_ENDPOINT` from `http://localhost:9002` to the real AWS S3 endpoint (HTTPS by default)
6. **RabbitMQ TLS** — enable `amqps://` protocol with TLS certificates

## HSTS

After helmet is added, responses include `Strict-Transport-Security: max-age=15552000; includeSubDomains`. This tells browsers to only connect via HTTPS for the next 180 days. This header has no effect in local dev (browsers ignore it on `localhost`), but activates automatically when served over HTTPS in production.
