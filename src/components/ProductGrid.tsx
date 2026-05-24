"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  stock: StockEntry[];
};

export function ProductGrid({ products }: { products: Product[] }) {
  const [reservingProduct, setReservingProduct] = useState<Product | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const availableStock = reservingProduct?.stock.find(
    (s) => s.warehouseId === selectedWarehouse
  );

  function openReserve(product: Product) {
    const firstAvailable = product.stock.find((s) => s.availableUnits > 0);
    setReservingProduct(product);
    setSelectedWarehouse(firstAvailable?.warehouseId ?? product.stock[0]?.warehouseId ?? "");
    setQuantity(1);
    setError(null);
  }

  function closeModal() {
    setReservingProduct(null);
    setError(null);
  }

  async function handleReserve() {
    if (!reservingProduct || !selectedWarehouse) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: reservingProduct.id,
          warehouseId: selectedWarehouse,
          quantity,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError("Not enough stock available. Someone may have just reserved the last unit.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Failed to create reservation");
        return;
      }

      router.push(`/reservations/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => {
          const totalAvailable = product.stock.reduce((sum, s) => sum + s.availableUnits, 0);
          const isLowStock = totalAvailable > 0 && totalAvailable <= 3;
          const isOutOfStock = totalAvailable === 0;

          return (
            <div
              key={product.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col hover:border-gray-700 transition-colors"
            >
              {product.imageUrl && (
                <div className="aspect-video bg-gray-800 overflow-hidden">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover opacity-90"
                  />
                </div>
              )}
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="font-semibold text-gray-100 leading-tight">{product.name}</h2>
                  <span className="text-emerald-400 font-mono text-sm whitespace-nowrap font-medium">
                    ₹{product.price.toLocaleString("en-IN")}
                  </span>
                </div>

                {product.description && (
                  <p className="text-gray-500 text-xs leading-relaxed mb-4">
                    {product.description}
                  </p>
                )}

                <div className="mt-auto space-y-2">
                  {/* Stock per warehouse */}
                  <div className="space-y-1.5 mb-3">
                    {product.stock.map((s) => (
                      <div
                        key={s.warehouseId}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-500">{s.warehouseName}</span>
                        <span
                          className={
                            s.availableUnits === 0
                              ? "text-gray-600"
                              : s.availableUnits <= 3
                              ? "text-amber-400"
                              : "text-gray-400"
                          }
                        >
                          {s.availableUnits === 0
                            ? "out of stock"
                            : `${s.availableUnits} available`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {isLowStock && (
                    <p className="text-amber-400 text-xs font-medium">
                      ⚡ Only {totalAvailable} left across all warehouses
                    </p>
                  )}

                  <button
                    onClick={() => openReserve(product)}
                    disabled={isOutOfStock}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isOutOfStock
                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                        : "bg-emerald-500 hover:bg-emerald-400 text-gray-950 active:scale-95"
                    }`}
                  >
                    {isOutOfStock ? "Out of Stock" : "Reserve"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reserve Modal */}
      {reservingProduct && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-semibold text-gray-100 text-lg">{reservingProduct.name}</h3>
                <p className="text-emerald-400 font-mono text-sm mt-0.5">
                  ₹{reservingProduct.price.toLocaleString("en-IN")}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-600 hover:text-gray-400 text-xl leading-none p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  Warehouse
                </label>
                <div className="space-y-2">
                  {reservingProduct.stock.map((s) => (
                    <label
                      key={s.warehouseId}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedWarehouse === s.warehouseId
                          ? "border-emerald-500 bg-emerald-500/10"
                          : s.availableUnits === 0
                          ? "border-gray-800 opacity-50 cursor-not-allowed"
                          : "border-gray-800 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="warehouse"
                          value={s.warehouseId}
                          checked={selectedWarehouse === s.warehouseId}
                          onChange={() => {
                            setSelectedWarehouse(s.warehouseId);
                            setQuantity(1);
                          }}
                          disabled={s.availableUnits === 0}
                          className="accent-emerald-500"
                        />
                        <div>
                          <p className="text-sm text-gray-200">{s.warehouseName}</p>
                          <p className="text-xs text-gray-600">{s.warehouseLocation}</p>
                        </div>
                      </div>
                      <span
                        className={`text-xs ${
                          s.availableUnits === 0
                            ? "text-gray-600"
                            : s.availableUnits <= 3
                            ? "text-amber-400"
                            : "text-gray-500"
                        }`}
                      >
                        {s.availableUnits} left
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  Quantity
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-gray-100 font-medium">{quantity}</span>
                  <button
                    onClick={() =>
                      setQuantity((q) =>
                        Math.min(availableStock?.availableUnits ?? 1, q + 1)
                      )
                    }
                    disabled={quantity >= (availableStock?.availableUnits ?? 0)}
                    className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                  <span className="text-xs text-gray-600">
                    max {availableStock?.availableUnits ?? 0}
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="pt-1">
                <div className="flex items-center justify-between mb-3 text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="text-gray-100 font-mono font-medium">
                    ₹{(reservingProduct.price * quantity).toLocaleString("en-IN")}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-3">
                  Items will be held for 10 minutes while you complete payment.
                </p>
                <button
                  onClick={handleReserve}
                  disabled={loading || !availableStock || availableStock.availableUnits === 0}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Reserving…" : `Reserve ${quantity} unit${quantity !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
