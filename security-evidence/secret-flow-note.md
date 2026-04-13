# Secrets Management

## Where Secrets Live

All secrets are stored in `.env` / `.env.local` files at the project root. These files are listed in `.gitignore` and are never committed to the repository. A `.env.example` file with placeholder values is committed as a template.

### Current Secrets Inventory

| Secret                           | Source | Used By                                                    |
| -------------------------------- | ------ | ---------------------------------------------------------- |
| `JWT_SECRET`                     | `.env` | `AuthModule` — signing/verifying access and refresh tokens |
| `DATABASE_URL`                   | `.env` | `TypeOrmModule` — PostgreSQL connection (Neon.tech)        |
| `AWS_ACCESS_KEY_ID`              | `.env` | `S3Service` — file upload presigned URLs                   |
| `AWS_SECRET_ACCESS_KEY`          | `.env` | `S3Service` — file upload presigned URLs                   |
| `RABBITMQ_URL`                   | `.env` | `RabbitmqService` — message queue connection               |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `.env` | Database seeder only (not used at runtime)                 |

## How Secrets Reach Runtime

```
.env file (on disk, gitignored)
    ↓
ConfigModule.forRoot({ envFilePath: ['.env.local', '.env'] })
    ↓
ConfigService.get<string>('JWT_SECRET')
    ↓
Used in JwtModule, TypeOrmModule, S3Service, etc.
```

NestJS `ConfigModule` loads environment variables at startup. Services access them via `ConfigService`, never via hardcoded values.

## What Must Never Be Logged

The `AuditService` and application logs must never contain:

- Raw JWT tokens (access or refresh)
- User passwords (plaintext or hashed)
- `JWT_SECRET` or any signing key
- AWS credentials
- Database connection strings
- RabbitMQ credentials
- Full payment details (if added in future)

The `@Exclude()` decorator on the `User.password` and `User.refreshToken` fields prevents serialization in API responses.

## Environment Separation

| Environment      | Current State                          | Target State                                        |
| ---------------- | -------------------------------------- | --------------------------------------------------- |
| **Local dev**    | `.env.local` with dev credentials      | Same                                                |
| **CI / Testing** | `.env` with test values, not committed | CI environment variables                            |
| **Staging**      | Not yet configured                     | Environment variables via deployment platform       |
| **Production**   | Not yet configured                     | Cloud secret manager (AWS Secrets Manager or Vault) |

## Rotation Strategy

### JWT_SECRET

**Current:** Single static secret in `.env`.

**Rotation procedure:**

1. Generate a new secret
2. Deploy the new secret alongside the old one (dual-secret validation window)
3. All existing access tokens (15min TTL) expire naturally
4. Refresh tokens (7d TTL) — force re-login or support dual-secret verification during transition
5. Remove the old secret after the transition window

**Target:** Use asymmetric keys (RS256) instead of a shared secret. Public key can be distributed for verification; only the private key needs protection.

### DATABASE_URL

**Current:** Static connection string in `.env`.

**Rotation procedure:**

1. Create new database credentials in Neon.tech
2. Update `.env` with new connection string
3. Restart application
4. Revoke old credentials

**Target:** Use IAM-based authentication or short-lived credentials from a secret manager.

### AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY

**Current:** Static MinIO credentials in `.env`.

**Rotation procedure:**

1. Create new access key in AWS/MinIO console
2. Update `.env`
3. Restart application
4. Delete old access key

**Target:** Use IAM roles (on AWS) so the application never handles static credentials.

### RABBITMQ_URL

**Current:** Static credentials embedded in URL.

**Rotation procedure:**

1. Create new user in RabbitMQ
2. Update `RABBITMQ_URL` in `.env`
3. Restart application
4. Delete old user

**Target:** Use TLS client certificates or short-lived tokens.
