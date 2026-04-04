# Security Baseline — NestJS E-commerce Backend

## Service Overview

An e-commerce backend built with NestJS, TypeScript, PostgreSQL (Neon.tech), TypeORM, RabbitMQ, and S3/MinIO. Modules: Users, Products, Orders, OrderItems, Files, Auth, Worker. Exposes both REST API and GraphQL endpoints.

---

## 1. Security Review by Category

### 1.1 Authentication / Session / JWT

| What exists                              | Risk before HW                       | What was added                                                  | Backlog / TODO                                              |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| JWT access (15min) + refresh (7d) tokens | Refresh token theft → session hijack | Audit logging on login success/failure, logout, password change | Refresh token rotation (single-use), token family detection |
| bcrypt password hashing (10 rounds)      | —                                    | —                                                               | Consider argon2 for new projects                            |
| Refresh token hashed in DB               | —                                    | —                                                               | —                                                           |
| `@Exclude()` on password field           | —                                    | —                                                               | —                                                           |
| `ValidationPipe` with `whitelist: true`  | —                                    | —                                                               | Add `forbidNonWhitelisted: true` for stricter input         |

### 1.2 Access Control / Roles / Scopes

| What exists                                                     | Risk before HW                                           | What was added                                                  | Backlog / TODO                       |
| --------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| Role enum: admin, customer, warehouse_manager, customer_support | Role change without audit trail                          | Audit logging on `PATCH /users/:id/role` with previous/new role | —                                    |
| Permission-based guards (`PermissionsGuard`)                    | —                                                        | —                                                               | —                                    |
| `ROLE_PERMISSIONS` mapping                                      | Overly broad CUSTOMER_SUPPORT permissions (WRITE_ORDERS) | —                                                               | Review CUSTOMER_SUPPORT scope        |
| GraphQL resolvers marked `@Public()`                            | Schema/data leak in production                           | Disabled playground + introspection in production               | Add auth guards to GraphQL resolvers |

### 1.3 Secrets Management

| What exists                               | Risk before HW                         | What was added                                        | Backlog / TODO                                   |
| ----------------------------------------- | -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `.env` files with ConfigService           | Secrets could leak in logs             | Audit service never logs raw tokens/passwords/secrets | —                                                |
| `.env` in `.gitignore`                    | `.env.example` has placeholder secrets | —                                                     | —                                                |
| `JWT_SECRET` from env                     | No rotation strategy documented        | Documented rotation strategy in `secret-flow-note.md` | Implement automated rotation                     |
| DB creds, AWS keys, RabbitMQ creds in env | Same secret across environments        | —                                                     | Per-environment secrets via cloud secret manager |

### 1.4 Transport Security / TLS

| What exists                       | Risk before HW                                    | What was added                          | Backlog / TODO                                      |
| --------------------------------- | ------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `DATABASE_SSL` flag for Neon.tech | `rejectUnauthorized: false` skips cert validation | Documented TLS posture in `tls-note.md` | Set `rejectUnauthorized: true` with proper CA cert  |
| No HTTPS on app server            | Traffic in cleartext locally                      | —                                       | TLS termination at reverse proxy (nginx/Cloudflare) |

### 1.5 Input Surface / Abuse Protection

| What exists                                          | Risk before HW            | What was added                                                                                                                             | Backlog / TODO                                 |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Global throttle: 10 req/60s                          | One limit for all traffic | Stricter throttle on `POST /orders` (5/60s), `PATCH :id/role` (5/60s), `POST /auth/refresh` (5/60s), `PATCH /auth/change-password` (3/60s) | Per-IP tracking behind proxy, CAPTCHA on login |
| Stricter throttle on login (5/60s), register (3/60s) | —                         | —                                                                                                                                          | —                                              |
| `ValidationPipe` with whitelisting                   | —                         | —                                                                                                                                          | —                                              |
| Idempotency keys on orders                           | —                         | —                                                                                                                                          | —                                              |
| `helmet()` not configured                            | Missing security headers  | Added `helmet()` in `main.ts`                                                                                                              | —                                              |

### 1.6 Logging / Auditability

| What exists                | Risk before HW                        | What was added                                                                                                    | Backlog / TODO                                 |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| NestJS Logger for app logs | No structured audit trail             | `AuditService` with structured JSON logs                                                                          | Ship logs to centralized system (ELK, Datadog) |
| —                          | Can't answer "who changed what, when" | Audit events for: login (success/fail), register, logout, password change, role change, order creation            | Audit: file access, order status changes       |
| —                          | —                                     | Audit events include: action, actorId, actorRole, targetType, targetId, outcome, reason, ip, userAgent, timestamp | Add correlationId / requestId                  |

---

## 2. Risk Surface Area Table

| Surface area                  | Risk                             | Control before HW                    | What was added                                    | Evidence                                  | Residual risk                            |
| ----------------------------- | -------------------------------- | ------------------------------------ | ------------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| `POST /auth/login`            | Brute force, credential stuffing | Throttle 5/60s, JWT auth             | Audit log on login failure with IP                | `security-evidence/audit-log-example.txt` | No CAPTCHA, no account lockout           |
| `POST /auth/register`         | Spam account creation            | Throttle 3/60s                       | Audit log on register                             | `security-evidence/audit-log-example.txt` | No email verification                    |
| `POST /auth/refresh`          | Token replay                     | Hashed refresh token in DB           | Throttle 5/60s added                              | —                                         | No single-use rotation                   |
| `PATCH /auth/change-password` | Account takeover via brute force | Requires current password            | Throttle 3/60s + audit log                        | `security-evidence/audit-log-example.txt` | —                                        |
| `PATCH /users/:id/role`       | Privilege escalation             | `WRITE_USERS` permission required    | Audit log with prev/new role + throttle 5/60s     | `security-evidence/audit-log-example.txt` | No "cannot elevate above own role" check |
| `POST /orders`                | Abuse, duplicate orders          | Idempotency key, pessimistic locking | Audit log + throttle 5/60s                        | `security-evidence/audit-log-example.txt` | —                                        |
| `GraphQL Playground`          | Schema leak, introspection abuse | `playground: true` always            | Disabled playground + introspection in production | `security-evidence/headers.txt`           | —                                        |
| All endpoints                 | Missing security headers         | None                                 | `helmet()` added                                  | `security-evidence/headers.txt`           | CSP disabled in dev for playground       |
| All endpoints                 | DDoS / abuse                     | Global throttle 10/60s               | Stricter per-route throttles on risky endpoints   | `security-evidence/rate-limit.txt`        | No per-IP tracking behind proxy          |

---

## 3. Changes Summary

### Code changes

| File                              | Change                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `src/main.ts`                     | Added `helmet()` middleware with production-aware CSP                          |
| `src/app.module.ts`               | Added `AuditModule`, disabled GraphQL playground/introspection in production   |
| `src/audit/audit.service.ts`      | **New** — structured audit logging service                                     |
| `src/audit/audit.module.ts`       | **New** — global module for audit service                                      |
| `src/auth/auth.controller.ts`     | Pass `@Req()` to service methods; added throttle on refresh + change-password  |
| `src/auth/auth.service.ts`        | Audit logs on login success/failure, register, logout, password change         |
| `src/users/users.controller.ts`   | Audit log on role change with previous/new role; added throttle on role change |
| `src/orders/orders.controller.ts` | Audit log on order creation; added throttle on order creation                  |

### New dependencies

```bash
npm install helmet
```

---

## 4. What Was the Weakest Point

**Before hardening**, the biggest gaps were:

1. **No audit trail** — impossible to investigate who did what and when
2. **No security headers** — responses had zero protection headers
3. **GraphQL playground open in production** — full schema introspection for anyone
4. **Uniform rate limiting** — same limit for login as for reading products

---

## 5. What Remains in Backlog

- Refresh token rotation (single-use tokens with token family detection)
- Account lockout after N failed login attempts
- CAPTCHA on login/register
- `rejectUnauthorized: true` for DB SSL with proper CA cert
- Per-IP rate limiting behind reverse proxy (`X-Forwarded-For`)
- Centralized log shipping (ELK / Datadog)
- Auth guards on GraphQL resolvers (currently `@Public()`)
- CorrelationId middleware for request tracing
- Cloud secret manager integration (AWS Secrets Manager / Vault)
- Email verification on registration
