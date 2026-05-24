// src/lib/expiry.ts
import { prisma } from "./prisma";

/**
 * Releases any expired PENDING reservations and restores stock.
 * Called lazily on reads (GET /api/products) and on reservation reads.
 * Also called by the Vercel Cron job at /api/cron/expire-reservations.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find all expired pending reservations
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
  });

  if (expired.length === 0) return 0;

  // Release each in a transaction to restore stock
  let released = 0;
  for (const reservation of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED", releasedAt: now },
        });

        await tx.stockLevel.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: {
            reservedUnits: { decrement: reservation.quantity },
          },
        });
      });
      released++;
    } catch (err) {
      // Log but don't throw — process remaining reservations
      console.error(`Failed to release reservation ${reservation.id}:`, err);
    }
  }

  return released;
}
