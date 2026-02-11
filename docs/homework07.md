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

Without DataLoader, fetching orders with products caused:

```sql
SELECT * FROM orders           -- 1 query
SELECT * FROM order_items      -- 1 query
SELECT * FROM products WHERE id = 1  -- individual queries
SELECT * FROM products WHERE id = 2
SELECT * FROM products WHERE id = 3
...
```

Result: 2 + N queries (N = number of products)

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

## 4. Before/After Proof

### Before DataLoader

```sql
query: SELECT ... FROM products WHERE id = $1 -- [1]
query: SELECT ... FROM products WHERE id = $1 -- [2]
query: SELECT ... FROM products WHERE id = $1 -- [3]
```

Multiple individual queries.

### After DataLoader

```sql
query: SELECT ... FROM products WHERE id IN ($1, $2) -- [1,2]
```

Single batched query.

**Result:** 10 orders with 20 products: 22 queries → 3 queries (86% reduction)

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
