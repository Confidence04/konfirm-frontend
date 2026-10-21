"use client";

// Admin-only merchant preview page. An admin opens this by clicking "Preview"
// on the Merchants page, which calls POST /admin/merchants/:id/preview-token
// and opens the returned `preview_url` (pointing here) in a new tab. The
// token is short-lived, read-only, and audit-logged server-side. The banner
// makes it clear to the admin that this is a preview, not a real merchant session.

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";

interface Payment {
  id: string;
  net_usdc: string;
  asset_code: string;
  payer_address: string;
  link_description: string | null;
  status: "paid" | "held" | "refunded" | "disputed";
}

interface MerchantPreview {
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
}

function formatAmount(amount: number, code: string): string {
  return code === "USDC" ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${code}`;
}

export default function MerchantPreviewPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [preview, setPreview] = useState<MerchantPreview | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("No preview token provided.");
      setLoading(false);
      return;
    }
    const [metaRes, paymentsRes] = await Promise.all([
      fetch(`${API_BASE}/admin/merchant-preview/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
      }),
      fetch(`${API_BASE}/admin/merchant-preview/payments`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
      }),
    ]);
    if (!metaRes.ok) {
      const body = await metaRes.json().catch(() => ({}));
      setError((body as { message?: string }).message ?? "Preview token invalid or expired.");
      setLoading(false);
      return;
    }
    const meta: MerchantPreview = await metaRes.json();
    setPreview(meta);
    if (paymentsRes.ok) {
      const data: Payment[] = await paymentsRes.json().catch(() => []);
      setPayments(data);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const totals: Record<string, number> = {};
  payments
    .filter((p) => p.status === "paid")
    .forEach((p) => {
      totals[p.asset_code] = (totals[p.asset_code] || 0) + Number(p.net_usdc);
    });

  return (
    <div className="wrap">
      {/* Admin preview banner — always visible, not dismissible */}
      <div
        role="status"
        style={{
          background: "var(--yellow, #fef3c7)",
          color: "var(--yellow-text, #92400e)",
          borderBottom: "1px solid var(--yellow-border, #fcd34d)",
          padding: "0.75rem 1.5rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        ⚠ Admin preview — read-only view of{" "}
        {preview ? `${preview.merchant_name} (${preview.merchant_email})` : "a merchant account"}. This is not a real
        merchant session and all actions are disabled.
      </div>

      {loading ? (
        <div className="empty" style={{ padding: "2rem" }}>
          Loading preview…
        </div>
      ) : error ? (
        <div className="empty" style={{ padding: "2rem", color: "var(--red, #ef4444)" }}>
          {error}
        </div>
      ) : (
        <div style={{ padding: "2rem" }}>
          <h1>{preview?.merchant_name}&apos;s activity</h1>
          <p className="sub">
            Admin read-only preview — every payment below landed and was konfirmed on-chain.
          </p>

          <div className="balance">
            {Object.keys(totals).length > 0 ? (
              Object.entries(totals).map(([code, amount]) => (
                <div key={code}>
                  {formatAmount(amount, code)} <small>received</small>
                </div>
              ))
            ) : (
              <>
                $0.00 <small>received</small>
              </>
            )}
          </div>

          {payments.length === 0 ? (
            <div className="empty">No payments yet.</div>
          ) : (
            payments.map((p) => (
              <div className="payment" key={p.id}>
                <div className="left">
                  <div className="tick">✓</div>
                  <div className="desc">
                    {p.link_description || "Payment"}
                    <div className="from">
                      from {p.payer_address.slice(0, 4)}…{p.payer_address.slice(-4)}
                    </div>
                  </div>
                </div>
                <div className="amount">
                  {p.status === "held" ? "On hold" : formatAmount(Number(p.net_usdc), p.asset_code)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
