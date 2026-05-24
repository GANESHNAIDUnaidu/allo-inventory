# Allo Inventory — Take-Home Exercise

A Next.js inventory reservation platform for multi-warehouse retail. Customers can reserve stock at checkout, holding units for 10 minutes while payment completes — preventing overselling without tanking conversion by blocking stock at add-to-cart time.

**Live URL:** `https://allo-inventory-reservation-blond.vercel.app/  


---

## Running Locally

### Prerequisites

- Node.js 18+
- A hosted Postgres instance ([Supabase](https://supabase.com), [Neon](https://neon.tech), or [Railway](https://railway.app) — all have free tiers)
- An [Upstash](https://upstash.com) Redis instance (free tier works)

### Setup

```bash
git clone https://github.com/YOUR-USERNAME/allo-inventory
cd allo-inventory
npm install
```

Copy the env file and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Transaction pooler URI |
| `DIRECT_URL` | Supabase → Settings → Database → Direct connection URI |
| `UPSTASH_REDIS_REST_URL` | Upstash Console → REST API tab |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → REST API tab |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |
| `CRON_SECRET` | Any random string |

### Run migrations and seed

```bash
npm run db:migrate   # applies Prisma migrations to your Postgres instance
npm run db:seed      # seeds 3 warehouses, 6 products, and stock levels
npm run dev          # starts Next.js on http://localhost:3000
```

---

## Architecture & Key Decisions

### Concurrency — the core of the exercise

The reservation endpoint must ensure that if two requests arrive simultaneously for the last unit of a SKU, exactly one succeeds and the other gets a 409.

I use **two layers of protection**:

**Layer 1 — Redis distributed lock** (`src/lib/redis.ts`)

```
POST /api/reservations
  → acquireLock("lock:stock:{productId}:{warehouseId}", ttl=5s)
    → if already held: 503 (retry)
    → else: enter critical section
      → Postgres transaction
      → releaseLock()
```

`SET key 1 NX PX 5000` is atomic in Redis — only one caller gets `OK`. This serialises concurrent Lambda invocations for the same SKU before they even touch Postgres.

**Layer 2 — Postgres transaction with optimistic increment**

Inside the lock, a single `$transaction` block:
1. Reads `stock_levels` for the row
2. Checks `totalUnits - reservedUnits >= quantity`
3. If yes: `UPDATE ... SET reservedUnits = reservedUnits + quantity` (atomic increment)
4. Creates the reservation row

The atomic `INCREMENT` means even if the Redis lock somehow allows two concurrent readers (e.g. lock TTL expired mid-flight), the Postgres constraint `reservedUnits <= totalUnits` will be violated and one transaction rolls back. In practice both layers together make race conditions effectively impossible.

**Why not `SELECT FOR UPDATE`?**

A `SELECT FOR UPDATE` row lock in Postgres would also work, but Supabase's connection pooler (PgBouncer in transaction mode) drops advisory locks and `FOR UPDATE` can cause deadlocks under high load. The Redis lock + atomic increment pattern is safer with a pooled connection.

### Reservation expiry — two-pronged approach

**1. Vercel Cron (production)**

`vercel.json` schedules `GET /api/cron/expire-reservations` every minute. This route calls `releaseExpiredReservations()` which:
- Finds all `PENDING` reservations where `expiresAt < NOW()`
- For each: sets `status = RELEASED`, decrements `reservedUnits`

The cron is protected by a `CRON_SECRET` header check to prevent public triggering.

**2. Lazy cleanup on read (belt-and-suspenders)**

`GET /api/products` calls `releaseExpiredReservations()` before returning stock counts. This means even if the cron missed a window, the product listing will always show correct available numbers. The confirm endpoint also checks expiry inline and self-releases if expired at confirm time.

**Trade-off:** The cron runs every minute, so there's up to a 60-second window where an expired reservation still shows as "reserved" in the DB. For a real system I'd use a Postgres `pg_cron` extension (runs inside the DB, no cold start) or reduce the cron interval. The lazy cleanup on reads mitigates this for the product listing.

### Idempotency (bonus)

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support an `Idempotency-Key` header.

Flow:
1. Check `idempotency_records` table for `key = "{endpoint}:{Idempotency-Key}"`
2. If found: return the stored `statusCode` + `responseBody` with `Idempotent-Replayed: true` header
3. If not: run the handler, then store the result

The record is stored after the handler completes (fire-and-forget with `.catch(console.error)`). A more robust implementation would use a Redis lock around the check+store to handle the race between two simultaneous requests with the same key, but for this exercise the Postgres `UNIQUE` constraint on the key column is sufficient — the second write will throw and the first response will be replayed.

### Data model

```
Product ──< StockLevel >── Warehouse
                │
Product ──< Reservation >── Warehouse
```

`StockLevel` tracks `totalUnits` and `reservedUnits` per (product, warehouse). Available units = `totalUnits - reservedUnits`. On confirm, both columns decrement (stock is permanently sold). On release/expire, only `reservedUnits` decrements (stock returns to available).

---

## API Reference

| Method | Path | Success | Error |
|---|---|---|---|
| `GET` | `/api/products` | 200 — array of products with per-warehouse stock | 500 |
| `GET` | `/api/warehouses` | 200 — array of warehouses | 500 |
| `POST` | `/api/reservations` | 201 — reservation object | 409 insufficient stock, 503 lock contention |
| `GET` | `/api/reservations/:id` | 200 — reservation object | 404 |
| `POST` | `/api/reservations/:id/confirm` | 200 — updated reservation | 410 expired, 409 already released |
| `POST` | `/api/reservations/:id/release` | 200 — updated reservation | 409 already confirmed |
| `GET` | `/api/cron/expire-reservations` | 200 — count of released | 401 unauthorised |

---

## Deployment

### Vercel + Supabase + Upstash (recommended)

1. Push this repo to GitHub
2. Import into [Vercel](https://vercel.com) — it auto-detects Next.js
3. Add all env vars from `.env.example` in Vercel → Settings → Environment Variables
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL
5. On first deploy, run migrations:
   ```bash
   npx prisma migrate deploy
   npx tsx prisma/seed.ts
   ```
   Or use Vercel's build command: add `npm run db:migrate && npm run db:seed` once, then remove the seed step.

The `vercel.json` cron runs automatically on Vercel's Pro plan. On Hobby, crons run once per day — use the lazy cleanup path (already implemented) as the primary expiry mechanism.

---

## Trade-offs & What I'd Do Differently

**What's solid:**
- The concurrency model (Redis lock + atomic Postgres increment) is correct under high load
- Two-layer expiry (cron + lazy cleanup) means no stale stock in the UI
- Full idempotency on the two write-heavy endpoints
- Type-safe end-to-end with Zod schemas shared between API and frontend

**What I'd improve with more time:**

1. **Auth** — Reservations should be tied to a user session. Right now anyone with a reservation ID can confirm/release it. I'd add NextAuth or Supabase Auth and associate `userId` with reservations.

2. **Optimistic locking instead of Redis** — Postgres `version` column + `WHERE version = $expected` is simpler to operate than a Redis dependency, though Redis gives better throughput at high concurrency.

3. **Cron granularity** — On Vercel Hobby the cron is once per day. I'd move to `pg_cron` inside Supabase (runs every minute natively) or use Upstash QStash to schedule a job when each reservation is created.

4. **WebSockets / SSE for real-time stock** — The product listing currently requires a page refresh to see updated stock. I'd add Server-Sent Events so all connected clients see stock changes live.

5. **Retry logic on 503** — When the Redis lock is contended, the API returns 503. The frontend currently surfaces this as an error; I'd add exponential backoff retry (2-3 attempts) in the client before surfacing the error.

6. **Tests** — I'd add integration tests using `vitest` + a local Postgres + `ioredis-mock`, specifically targeting the concurrent reservation scenario with `Promise.all` racing two requests.
