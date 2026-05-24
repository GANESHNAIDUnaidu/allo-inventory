// src/lib/idempotency.ts
import { prisma } from "./prisma";
import { NextResponse } from "next/server";

export async function withIdempotency(
  request: Request,
  endpoint: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const idempotencyKey = request.headers.get("Idempotency-Key");

  if (!idempotencyKey) {
    return handler();
  }

  // Check for existing record
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key: `${endpoint}:${idempotencyKey}` },
  });

  if (existing) {
    const body = JSON.parse(existing.responseBody);
    return NextResponse.json(body, {
      status: existing.statusCode,
      headers: { "Idempotent-Replayed": "true" },
    });
  }

  // Execute the handler
  const response = await handler();
  const responseBody = await response.clone().json();

  // Store the result (fire-and-forget — don't block the response)
  prisma.idempotencyRecord
    .create({
      data: {
        key: `${endpoint}:${idempotencyKey}`,
        endpoint,
        statusCode: response.status,
        responseBody: JSON.stringify(responseBody),
      },
    })
    .catch(console.error);

  return response;
}
