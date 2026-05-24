// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.idempotencyRecord.deleteMany();

  // Create warehouses
  const warehouse1 = await prisma.warehouse.create({
    data: {
      name: "Chennai Central",
      location: "Chennai, Tamil Nadu",
    },
  });

  const warehouse2 = await prisma.warehouse.create({
    data: {
      name: "Mumbai Hub",
      location: "Mumbai, Maharashtra",
    },
  });

  const warehouse3 = await prisma.warehouse.create({
    data: {
      name: "Delhi North",
      location: "Delhi NCR",
    },
  });

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wireless Noise-Cancelling Headphones",
        description: "Premium over-ear headphones with 40hr battery life and active noise cancellation.",
        price: 8999,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Keyboard TKL",
        description: "Tenkeyless mechanical keyboard with Cherry MX switches and RGB backlighting.",
        price: 5499,
        imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "4K Webcam Pro",
        description: "Ultra HD webcam with auto-focus, low-light correction, and dual microphones.",
        price: 6999,
        imageUrl: "https://images.unsplash.com/photo-1596742578443-7682ef5251cd?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Ergonomic Mouse",
        description: "Vertical ergonomic mouse with 6 programmable buttons and wireless 2.4GHz connectivity.",
        price: 2999,
        imageUrl: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "USB-C Hub 7-in-1",
        description: "Multiport adapter with 4K HDMI, 100W PD charging, 3x USB-A, SD card reader.",
        price: 3499,
        imageUrl: "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Monitor Light Bar",
        description: "LED monitor light bar with asymmetric optical design, no screen glare.",
        price: 1999,
        imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400",
      },
    }),
  ]);

  // Create stock levels
  const stockData = [
    // Headphones
    { productIdx: 0, warehouseId: warehouse1.id, total: 15, reserved: 0 },
    { productIdx: 0, warehouseId: warehouse2.id, total: 8, reserved: 0 },
    { productIdx: 0, warehouseId: warehouse3.id, total: 1, reserved: 0 }, // Low stock!
    // Keyboard
    { productIdx: 1, warehouseId: warehouse1.id, total: 20, reserved: 0 },
    { productIdx: 1, warehouseId: warehouse2.id, total: 5, reserved: 0 },
    // Webcam
    { productIdx: 2, warehouseId: warehouse1.id, total: 3, reserved: 0 }, // Low stock!
    { productIdx: 2, warehouseId: warehouse3.id, total: 12, reserved: 0 },
    // Mouse
    { productIdx: 3, warehouseId: warehouse1.id, total: 50, reserved: 0 },
    { productIdx: 3, warehouseId: warehouse2.id, total: 30, reserved: 0 },
    { productIdx: 3, warehouseId: warehouse3.id, total: 25, reserved: 0 },
    // Hub
    { productIdx: 4, warehouseId: warehouse2.id, total: 10, reserved: 0 },
    { productIdx: 4, warehouseId: warehouse3.id, total: 7, reserved: 0 },
    // Light Bar
    { productIdx: 5, warehouseId: warehouse1.id, total: 2, reserved: 0 }, // Low stock!
    { productIdx: 5, warehouseId: warehouse2.id, total: 18, reserved: 0 },
  ];

  for (const s of stockData) {
    await prisma.stockLevel.create({
      data: {
        productId: products[s.productIdx].id,
        warehouseId: s.warehouseId,
        totalUnits: s.total,
        reservedUnits: s.reserved,
      },
    });
  }

  console.log(`✅ Seeded:`);
  console.log(`   - ${3} warehouses`);
  console.log(`   - ${products.length} products`);
  console.log(`   - ${stockData.length} stock levels`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
