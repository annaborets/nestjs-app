# Homework 7: GraphQL for Orders + DataLoader

## 1. Schema Approach

**Choice:** Code-first with TypeScript decorators

**Reason:** We already have TypeScript entities. Code-first avoids duplication and provides compile-time type safety. Schema is auto-generated from code.

---

## 2. How Resolvers Work

**Thin resolvers** - business logic stays in services:

```typescript
@Query(() => [OrderType])
async getOrders(filter?, pagination?) {
  return this.ordersService.findAll(filter, pagination);
}
```

Resolver only accepts GraphQL arguments and calls existing service methods. No logic duplication between REST and GraphQL.

---

## 3. DataLoader Implementation

### Problem: N+1 Queries

Without DataLoader, fetching orders with products caused multiple individual queries for each product.

### Solution: ProductLoader

File: `src/orders/loaders/product.loader.ts`

```typescript
@Injectable({ scope: Scope.REQUEST })
export class ProductLoader {
  private readonly loader = new DataLoader<number, Product>(async (ids) => {
    const products = await this.productsService.findByIds([...ids]);
    const map = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => map.get(id) || null);
  });

  async load(id: number) {
    return this.loader.load(id);
  }
}
```

Batches multiple `load()` calls into one database query.

---

## 4. Proof: N+1 Eliminated

### Before DataLoader (N+1 Problem)

Each product was fetched individually:

```sql
query: SELECT DISTINCT "distinctAlias"."Order_id" AS "ids_Order_id", "distinctAlias"."Order_createdAt" FROM (SELECT "Order"."id" AS "Order_id", "Order"."idempotencyKey" AS "Order_idempotencyKey", "Order"."total" AS "Order_total", "Order"."status" AS "Order_status", "Order"."userId" AS "Order_userId", "Order"."createdAt" AS "Order_createdAt", "Order"."updatedAt" AS "Order_updatedAt", "Order__Order_orderItems"."id" AS "Order__Order_orderItems_id", "Order__Order_orderItems"."quantity" AS "Order__Order_orderItems_quantity", "Order__Order_orderItems"."price" AS "Order__Order_orderItems_price", "Order__Order_orderItems"."orderId" AS "Order__Order_orderItems_orderId", "Order__Order_orderItems"."productId" AS "Order__Order_orderItems_productId", "Order__Order_user"."id" AS "Order__Order_user_id", "Order__Order_user"."name" AS "Order__Order_user_name", "Order__Order_user"."email" AS "Order__Order_user_email", "Order__Order_user"."createdAt" AS "Order__Order_user_createdAt", "Order__Order_user"."updatedAt" AS "Order__Order_user_updatedAt" FROM "orders" "Order" LEFT JOIN "order_items" "Order__Order_orderItems" ON "Order__Order_orderItems"."orderId"="Order"."id"  LEFT JOIN "users" "Order__Order_user" ON "Order__Order_user"."id"="Order"."userId") "distinctAlias" ORDER BY "distinctAlias"."Order_createdAt" DESC, "Order_id" ASC LIMIT 10 OFFSET 0

query: SELECT "Order"."id" AS "Order_id", "Order"."idempotencyKey" AS "Order_idempotencyKey", "Order"."total" AS "Order_total", "Order"."status" AS "Order_status", "Order"."userId" AS "Order_userId", "Order"."createdAt" AS "Order_createdAt", "Order"."updatedAt" AS "Order_updatedAt", "Order__Order_orderItems"."id" AS "Order__Order_orderItems_id", "Order__Order_orderItems"."quantity" AS "Order__Order_orderItems_quantity", "Order__Order_orderItems"."price" AS "Order__Order_orderItems_price", "Order__Order_orderItems"."orderId" AS "Order__Order_orderItems_orderId", "Order__Order_orderItems"."productId" AS "Order__Order_orderItems_productId", "Order__Order_user"."id" AS "Order__Order_user_id", "Order__Order_user"."name" AS "Order__Order_user_name", "Order__Order_user"."email" AS "Order__Order_user_email", "Order__Order_user"."createdAt" AS "Order__Order_user_createdAt", "Order__Order_user"."updatedAt" AS "Order__Order_user_updatedAt" FROM "orders" "Order" LEFT JOIN "order_items" "Order__Order_orderItems" ON "Order__Order_orderItems"."orderId"="Order"."id"  LEFT JOIN "users" "Order__Order_user" ON "Order__Order_user"."id"="Order"."userId" WHERE "Order"."id" IN (7, 1, 35, 432, 63, 798, 317, 96, 6, 88) ORDER BY "Order"."createdAt" DESC

query: SELECT "Product"."id" AS "Product_id", "Product"."name" AS "Product_name", "Product"."description" AS "Product_description", "Product"."price" AS "Product_price", "Product"."stock" AS "Product_stock", "Product"."createdAt" AS "Product_createdAt", "Product"."updatedAt" AS "Product_updatedAt" FROM "products" "Product" WHERE (("Product"."id" = $1)) LIMIT 1 -- PARAMETERS: [2]

query: SELECT "Product"."id" AS "Product_id", "Product"."name" AS "Product_name", "Product"."description" AS "Product_description", "Product"."price" AS "Product_price", "Product"."stock" AS "Product_stock", "Product"."createdAt" AS "Product_createdAt", "Product"."updatedAt" AS "Product_updatedAt" FROM "products" "Product" WHERE (("Product"."id" = $1)) LIMIT 1 -- PARAMETERS: [1]
```

**Problem:** 2 queries for orders/items + N individual queries for products (one per product).

Total: **4+ queries** for just 2 products.

---

### After DataLoader (Batched Query)

Products fetched in one batched query:

```sql
query: SELECT DISTINCT "distinctAlias"."Order_id" AS "ids_Order_id", "distinctAlias"."Order_createdAt" FROM (SELECT "Order"."id" AS "Order_id", "Order"."idempotencyKey" AS "Order_idempotencyKey", "Order"."total" AS "Order_total", "Order"."status" AS "Order_status", "Order"."userId" AS "Order_userId", "Order"."createdAt" AS "Order_createdAt", "Order"."updatedAt" AS "Order_updatedAt", "Order__Order_orderItems"."id" AS "Order__Order_orderItems_id", "Order__Order_orderItems"."quantity" AS "Order__Order_orderItems_quantity", "Order__Order_orderItems"."price" AS "Order__Order_orderItems_price", "Order__Order_orderItems"."orderId" AS "Order__Order_orderItems_orderId", "Order__Order_orderItems"."productId" AS "Order__Order_orderItems_productId", "Order__Order_user"."id" AS "Order__Order_user_id", "Order__Order_user"."name" AS "Order__Order_user_name", "Order__Order_user"."email" AS "Order__Order_user_email", "Order__Order_user"."createdAt" AS "Order__Order_user_createdAt", "Order__Order_user"."updatedAt" AS "Order__Order_user_updatedAt" FROM "orders" "Order" LEFT JOIN "order_items" "Order__Order_orderItems" ON "Order__Order_orderItems"."orderId"="Order"."id"  LEFT JOIN "users" "Order__Order_user" ON "Order__Order_user"."id"="Order"."userId") "distinctAlias" ORDER BY "distinctAlias"."Order_createdAt" DESC, "Order_id" ASC LIMIT 10 OFFSET 0

query: SELECT "Order"."id" AS "Order_id", "Order"."idempotencyKey" AS "Order_idempotencyKey", "Order"."total" AS "Order_total", "Order"."status" AS "Order_status", "Order"."userId" AS "Order_userId", "Order"."createdAt" AS "Order_createdAt", "Order"."updatedAt" AS "Order_updatedAt", "Order__Order_orderItems"."id" AS "Order__Order_orderItems_id", "Order__Order_orderItems"."quantity" AS "Order__Order_orderItems_quantity", "Order__Order_orderItems"."price" AS "Order__Order_orderItems_price", "Order__Order_orderItems"."orderId" AS "Order__Order_orderItems_orderId", "Order__Order_orderItems"."productId" AS "Order__Order_orderItems_productId", "Order__Order_user"."id" AS "Order__Order_user_id", "Order__Order_user"."name" AS "Order__Order_user_name", "Order__Order_user"."email" AS "Order__Order_user_email", "Order__Order_user"."createdAt" AS "Order__Order_user_createdAt", "Order__Order_user"."updatedAt" AS "Order__Order_user_updatedAt" FROM "orders" "Order" LEFT JOIN "order_items" "Order__Order_orderItems" ON "Order__Order_orderItems"."orderId"="Order"."id"  LEFT JOIN "users" "Order__Order_user" ON "Order__Order_user"."id"="Order"."userId" WHERE "Order"."id" IN (7, 1, 35, 432, 63, 798, 317, 96, 6, 88) ORDER BY "Order"."createdAt" DESC

query: SELECT "Product"."id" AS "Product_id", "Product"."name" AS "Product_name", "Product"."description" AS "Product_description", "Product"."price" AS "Product_price", "Product"."stock" AS "Product_stock", "Product"."createdAt" AS "Product_createdAt", "Product"."updatedAt" AS "Product_updatedAt" FROM "products" "Product" WHERE "Product"."id" IN ($1, $2) -- PARAMETERS: [1,2]
```

**Solution:** 2 queries for orders/items + 1 batched query for all products using `WHERE IN`.

Total: **3 queries** regardless of product count.

**Improvement:** For 2 products: 4 queries → 3 queries. For 20 products: 22 queries → 3 queries (86% reduction).

---

## 5. Example Queries

### Basic query

```graphql
query {
  orders {
    id
    status
    total
    items {
      quantity
      product {
        name
        price
      }
    }
  }
}
```

### With filters

```graphql
query {
  orders(filter: { status: PENDING }, pagination: { limit: 5 }) {
    id
    status
    items {
      product {
        name
      }
    }
  }
}
```

---

## 6. Testing

1. Enable SQL logging: `TypeOrmModule.forRoot({ logging: true })`
2. Run query in GraphQL Playground at `http://localhost:3000/graphql`
3. Check terminal - should see batched `WHERE IN` query instead of multiple individual queries

---

## 7. Key Files

- `src/orders/models/` - GraphQL types
- `src/orders/inputs/` - Filter and pagination inputs
- `src/orders/loaders/product.loader.ts` - DataLoader implementation
- `src/orders/orders.resolver.ts` - GraphQL resolvers
