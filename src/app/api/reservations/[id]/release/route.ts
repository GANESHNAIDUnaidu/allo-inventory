// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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

      if (reservation.status === "RELEASED") {
        // Already released — idempotent
        return reservation;
      }

      if (reservation.status === "CONFIRMED") {
        throw new Error("ALREADY_CONFIRMED");
      }

      const now = new Date();

      // Restore the reserved units
      await tx.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reservedUnits: { decrement: reservation.quantity } },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: now },
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
      releasedAt: result.releasedAt?.toISOString() ?? null,
      createdAt: result.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
      if (error.message === "ALREADY_CONFIRMED") {
        return NextResponse.json(
          { error: "Cannot release a confirmed reservation" },
          { status: 409 }
        );
      }
    }
    console.error(`POST /api/reservations/${id}/release error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
