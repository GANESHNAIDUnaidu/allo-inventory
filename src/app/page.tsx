// src/app/page.tsx
import { ProductGrid } from "@/components/ProductGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getProducts() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/products`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-1">Products</h1>
        <p className="text-gray-500 text-sm">
          Reserve items to hold them while you complete checkout. Reservations expire after 10 minutes.
        </p>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
