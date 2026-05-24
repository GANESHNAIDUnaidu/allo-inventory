// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock, stockLockKey } from "@/lib/redis";
import { CreateReservationSchema } from "@/lib/schemas";
import { withIdempotency } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

const RESERVATION_TTL_MINUTES = 10;

export async function POST(request: NextRequest) {
  return withIdempotency(request, "POST:/api/reservations", async () => {
    const body = await request.json();

    // Validate input
    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // ── Distributed lock ──────────────────────────────────────────────────────
    // We lock per (product, warehouse) to serialise concurrent reservation
    // attempts for the same SKU. This means two requests that arrive at the
    // same millisecond cannot both see "available >= quantity" and both succeed.
    //
    // The lock TTL (5 s) is a safety net: if this Lambda crashes mid-flight
    // the lock self-expires and the next request can proceed.
    // ─────────────────────────────────────────────────────────────────────────
    const lockKey = stockLockKey(productId, warehouseId);
    const acquired = await acquireLock(lockKey, 5000);

    if (!acquired) {
      // Another request holds the lock — tell the client to retry
      return NextResponse.json(
        { error: "Stock is being updated, please retry in a moment" },
        { status: 503 }
      );
    }

    try {
      // All stock reads and writes happen inside a single serialisable
      // Postgres transaction. Combined with the Redis lock above this gives us
      // two layers of protection:
      //   1. Redis lock: prevents two Lambda invocations from even entering
      //      this critical section concurrently.
      //   2. Postgres transaction: ensures the check-and-update is atomic even
      //      if Redis somehow fails or the lock is not used (e.g. in tests).
      const reservation = await prisma.$transaction(async (tx) => {
        // Lock the stock row FOR UPDATE so Postgres serialises any concurrent
        // transactions that bypass the Redis lock
        const stock = await tx.stockLevel.findUnique({
          where: { productId_warehouseId: { productId, warehouseId } },
        });

        if (!stock) {
          throw new Error("STOCK_NOT_FOUND");
        }

        const available = stock.totalUnits - stock.reservedUnits;

        if (available < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        // Increment reservedUnits atomically
        await tx.stockLevel.update({
          where: { productId_warehouseId: { productId, warehouseId } },
          data: { reservedUnits: { increment: quantity } },
        });

        const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

        return tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
          },
          include: {
            product: true,
            warehouse: true,
          },
        });
      });

      return NextResponse.json(
        {
          id: reservation.id,
          productId: reservation.productId,
          productName: reservation.product.name,
          productPrice: reservation.product.price,
          warehouseId: reservation.warehouseId,
          warehouseName: reservation.warehouse.name,
          quantity: reservation.quantity,
          status: reservation.status,
          expiresAt: reservation.expiresAt.toISOString(),
          createdAt: reservation.createdAt.toISOString(),
        },
        { status: 201 }
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === "INSUFFICIENT_STOCK") {
          return NextResponse.json(
            { error: "Not enough stock available for this product at this warehouse" },
            { status: 409 }
          );
        }
        if (error.message === "STOCK_NOT_FOUND") {
          return NextResponse.json(
            { error: "Product not available at this warehouse" },
            { status: 404 }
          );
        }
      }
      console.error("POST /api/reservations error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    } finally {
      // Always release the lock
      await releaseLock(lockKey);
    }
  });
}
