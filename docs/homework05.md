# SQL Optimization

## Query I Chose to Optimize
Getting orders filtered by status:
```sql
SELECT * FROM orders 
WHERE status = 'processing' 
ORDER BY "createdAt" DESC;
```

## Before Optimization
```
Sort  (cost=17.65..17.66 rows=3 width=104) (actual time=0.031..0.031 rows=4 loops=1)
  Sort Key: "createdAt" DESC
  Sort Method: quicksort  Memory: 25kB
  ->  Seq Scan on orders  (cost=0.00..17.62 rows=3 width=104) (actual time=0.011..0.012 rows=4 loops=1)
        Filter: ((status)::text = 'pending'::text)
        Rows Removed by Filter: 4
Planning Time: 1.785 ms
Execution Time: 0.049 ms
```

The main issue here: database was doing a full table scan (Seq Scan) to find orders. Not efficient.

## What I Did
Added a composite index:
```sql
CREATE INDEX idx_orders_status_created ON orders(status, "createdAt" DESC);
```

Why composite? Because the query needs to:
1. Filter by status (WHERE clause)
2. Sort by createdAt (ORDER BY clause)

One index can handle both operations.

## After Optimization
```
Sort  (cost=18.98..19.12 rows=55 width=48) (actual time=0.038..0.041 rows=55 loops=1)
  Sort Key: "createdAt" DESC
  Sort Method: quicksort  Memory: 28kB
  ->  Bitmap Heap Scan on orders  (cost=4.70..17.39 rows=55 width=48) (actual time=0.020..0.026 rows=55 loops=1)
        Recheck Cond: ((status)::text = 'processing'::text)
        Heap Blocks: exact=2
        ->  Bitmap Index Scan on idx_orders_status_created  (cost=0.00..4.69 rows=55 width=0) (actual time=0.010..0.010 rows=55 loops=1)
              Index Cond: ((status)::text = 'processing'::text)
Planning Time: 0.149 ms
Execution Time: 0.338 ms
```

## Results

### What got better:
- Database now uses the index instead of scanning the whole table
- Initial scan cost dropped from 17.62 to 4.70 (about 73% less)
- PostgreSQL can quickly find the rows we need

