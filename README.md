# NestJS E-commerce Backend

A backend for an e-commerce system with proper transaction handling, prevention of duplicate orders, and protection against overselling.

## What's Inside

### Project Structure

Feature-based modules:
- **Users** - manages users
- **Products** - product catalog with stock
- **Orders** - creates orders safely
- **OrderItems** - items in each order

Each module has its own folder with everything it needs. Makes it easy to find stuff and add new features.

### Tech Stack

- **NestJS + TypeScript** - backend framework
- **PostgreSQL** - database
- **TypeORM** - talking to the database
- **Neon.tech** - cloud PostgreSQL (for dev)

## How Order Creation Works

### The Problem
When someone creates an order, a lot can go wrong:
- Network timeout → user clicks "buy" again → duplicate orders
- Two people buy the last item at the same time → overselling
- Something fails mid-process → partial order (order exists but no items)

### The Solution

**1. Transactions**
Everything happens in one transaction. If anything fails, nothing gets saved.
```typescript
// Start transaction
// 1. Create order
// 2. Create order items  
// 3. Update product stock
// Commit (or rollback if error)
```

**2. Idempotency**
Each order needs a unique `idempotencyKey`. If you send the same key twice, you get the same order back instead of creating a duplicate.

Good for:
- Network retries
- User double-clicking "buy"
- Any accidental duplicate request

**3. Preventing Oversell**
Using **pessimistic locking** - when checking if a product is in stock, we lock that row in the database. No one else can buy it until we're done.
```typescript
// Lock the product row
const product = await findOne(productId, { lock: 'FOR UPDATE' });
// Check stock
// Decrease stock
// Unlock (transaction commits)
```

Why pessimistic and not optimistic? For e-commerce, it's better to make people wait a millisecond than risk selling something we don't have.

## SQL Optimization

Optimized the query that filters orders by status (used in admin dashboards).

**Before:** Database scanned every row  
**After:** Created an index, now it only looks at relevant rows
```sql
CREATE INDEX idx_orders_status_created ON orders(status, "createdAt" DESC);
```

See `homework05.md` for detailed comparison.

## Setup
```bash
# Install
npm install

# Add your database URL to .env
DATABASE_URL=your_neon_connection_string

# Add test data
npm run seed

# Run
npm run start:dev
```

## Using the API

**Create an order:**
```bash
POST /orders

{
  "userId": 1,
  "idempotencyKey": "order-abc-123",
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
```

**Get products:**
```bash
GET /products
GET /products/1
```

**Get orders:**
```bash
GET /orders
GET /orders/1
```

## Error Handling

- `400` - Product doesn't exist
- `409` - Not enough stock
- `201` - Order created
- `200` - Same idempotency key, returning existing order
