// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withIdempotency(
    request,
    `POST:/api/reservations/${params.id}/confirm`,
    async () => {
      const { id } = params;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const reservation = await tx.reservation.findUnique({
            where: { id },
            include: { product: true, warehouse: true },
          });

          if (!reservation) {
            throw new Error("NOT_FOUND");
          }

          if (reservation.status === "CONFIRMED") {
            // Already confirmed — idempotent success
            return reservation;
          }

          if (reservation.status === "RELEASED") {
            throw new Error("ALREADY_RELEASED");
          }

          const now = new Date();

          // Check expiry
          if (reservation.expiresAt < now) {
            // Auto-release the expired reservation and restore stock
            await tx.reservation.update({
              where: { id },
              data: { status: "RELEASED", releasedAt: now },
            });
            await tx.stockLevel.update({
              where: {
                productId_warehouseId: {
                  productId: reservation.productId,
                  warehouseId: reservation.warehouseId,
                },
              },
              data: { reservedUnits: { decrement: reservation.quantity } },
            });
            throw new Error("EXPIRED");
          }

          // Confirm: move from reserved → permanently decremented
          // reservedUnits goes down; totalUnits goes down; net effect: available unchanged
          await tx.stockLevel.update({
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
            data: {
              totalUnits: { decrement: reservation.quantity },
              reservedUnits: { decrement: reservation.quantity },
            },
          });

          return tx.reservation.update({
            where: { id },
            data: { status: "CONFIRMED", confirmedAt: now },
            include: { product: true, warehouse: true },
          });
        });

        return NextResponse.json({
          id: result.id,
          productId: result.productId,
          productName: result.product.name,
          warehouseId: result.warehouseId,
          warehouseName: result.warehouse.name,
          quantity: result.quantity,
          status: result.status,
          expiresAt: result.expiresAt.toISOString(),
          confirmedAt: result.confirmedAt?.toISOString() ?? null,
          createdAt: result.createdAt.toISOString(),
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === "NOT_FOUND") {
            return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
          }
          if (error.message === "EXPIRED") {
            return NextResponse.json(
              { error: "Reservation has expired. Please start a new reservation." },
              { status: 410 }
            );
          }
          if (error.message === "ALREADY_RELEASED") {
            return NextResponse.json(
              { error: "Reservation was already released" },
              { status: 409 }
            );
          }
        }
        console.error(`POST /api/reservations/${id}/confirm error:`, error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    }
  );
}
