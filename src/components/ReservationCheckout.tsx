"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Reservation = {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  productImageUrl: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
};

function useCountdown(expiresAt: string, status: string) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (status !== "PENDING") return;
    const interval = setInterval(() => {
      setSecondsLeft(
        Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return { secondsLeft, minutes, seconds };
}

export function ReservationCheckout({
  initialReservation,
}: {
  initialReservation: Reservation;
}) {
  const [reservation, setReservation] = useState<Reservation>(initialReservation);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const { secondsLeft, minutes, seconds } = useCountdown(
    reservation.expiresAt,
    reservation.status
  );

  const isExpired = secondsLeft === 0 && reservation.status === "PENDING";
  const totalPrice = reservation.productPrice * reservation.quantity;

  const handleConfirm = useCallback(async () => {
    setLoading("confirm");
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.status === 410) {
        setError("Your reservation has expired. Please go back and reserve again.");
        setReservation((prev) => ({ ...prev, status: "RELEASED" }));
        return;
      }

      if (!res.ok) {
        setError(data.error || "Failed to confirm reservation");
        return;
      }

      setReservation((prev) => ({
        ...prev,
        status: "CONFIRMED",
        confirmedAt: data.confirmedAt,
      }));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const handleCancel = useCallback(async () => {
    setLoading("cancel");
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to cancel reservation");
        return;
      }

      setReservation((prev) => ({
        ...prev,
        status: "RELEASED",
        releasedAt: data.releasedAt,
      }));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const progressPct =
    reservation.status === "PENDING"
      ? (secondsLeft / 600) * 100
      : reservation.status === "CONFIRMED"
      ? 100
      : 0;

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push("/")}
          className="text-gray-600 hover:text-gray-400 text-sm flex items-center gap-2 transition-colors"
        >
          ← Back to products
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* Status Banner */}
        <div
          className={`px-6 py-3 text-sm font-medium flex items-center justify-between ${
            reservation.status === "CONFIRMED"
              ? "bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-400"
              : reservation.status === "RELEASED"
              ? "bg-gray-800/50 border-b border-gray-700 text-gray-500"
              : isExpired
              ? "bg-red-500/20 border-b border-red-500/30 text-red-400"
              : "bg-amber-500/10 border-b border-amber-500/20 text-amber-400"
          }`}
        >
          <span>
            {reservation.status === "CONFIRMED"
              ? "✓ Purchase confirmed"
              : reservation.status === "RELEASED"
              ? "Reservation released"
              : isExpired
              ? "⚠ Reservation expired"
              : "⏳ Reservation active"}
          </span>
          <span className="text-xs font-mono opacity-70">
            #{reservation.id.slice(-8).toUpperCase()}
          </span>
        </div>

        {/* Product */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex gap-4">
            {reservation.productImageUrl && (
              <img
                src={reservation.productImageUrl}
                alt={reservation.productName}
                className="w-20 h-20 rounded-lg object-cover bg-gray-800 flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-100 leading-snug">
                {reservation.productName}
              </h2>
              <p className="text-gray-500 text-sm mt-1">{reservation.warehouseName}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-gray-500 text-sm">Qty: {reservation.quantity}</span>
                <span className="text-emerald-400 font-mono font-medium">
                  ₹{totalPrice.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Countdown / Status Section */}
        <div className="p-6 border-b border-gray-800">
          {reservation.status === "PENDING" && !isExpired && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Time remaining</span>
                <span
                  className={`font-mono text-lg font-bold tabular-nums ${
                    secondsLeft < 60 ? "text-red-400" : secondsLeft < 180 ? "text-amber-400" : "text-gray-100"
                  }`}
                >
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    secondsLeft < 60
                      ? "bg-red-500"
                      : secondsLeft < 180
                      ? "bg-amber-400"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Reserved until{" "}
                {new Date(reservation.expiresAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </>
          )}

          {reservation.status === "CONFIRMED" && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <p className="text-gray-300 font-medium">Order placed successfully</p>
              <p className="text-gray-600 text-xs mt-1">
                Confirmed at{" "}
                {reservation.confirmedAt &&
                  new Date(reservation.confirmedAt).toLocaleString()}
              </p>
            </div>
          )}

          {(reservation.status === "RELEASED" || isExpired) && (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">↩</span>
              </div>
              <p className="text-gray-400 font-medium">
                {isExpired ? "Reservation expired" : "Reservation cancelled"}
              </p>
              <p className="text-gray-600 text-xs mt-1">Stock has been returned to inventory</p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        {reservation.status === "PENDING" && (
          <div className="p-6 space-y-3">
            {isExpired ? (
              <button
                onClick={() => router.push("/")}
                className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-all"
              >
                Browse Products
              </button>
            ) : (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={loading !== null}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === "confirm" ? "Processing…" : `Confirm Purchase · ₹${totalPrice.toLocaleString("en-IN")}`}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading !== null}
                  className="w-full py-3 rounded-xl border border-gray-800 hover:border-gray-700 text-gray-500 hover:text-gray-400 font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === "cancel" ? "Cancelling…" : "Cancel Reservation"}
                </button>
              </>
            )}
          </div>
        )}

        {(reservation.status === "CONFIRMED" || reservation.status === "RELEASED") && (
          <div className="p-6">
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-all"
            >
              {reservation.status === "CONFIRMED" ? "Continue Shopping" : "Browse Products"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
