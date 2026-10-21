"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { formatAmount } from "@/lib/format";

type PaymentStatus = "paid" | "held" | "disputed";

interface Payment {
  id: string;
  amount_usdc: string;
  asset_code: string;
  payer_address: string;
  status: PaymentStatus;
  flag_reason: string | null;
  tx_hash: string;
  created_at: string;
  merchant_name: string;
  merchant_email: string;
}

const STATUS_OPTIONS: PaymentStatus[] = ["paid", "held", "disputed"];

// Why the reconciler held a payment, in plain words for the reviewer.
const FLAG_LABEL: Record<string, string> = {
  no_session: "No payment link matched",
  amount_mismatch: "Amount differs from the link",
  asset_mismatch: "Different asset from the link",
  issuer_mismatch: "Asset issuer doesn't match (possible fake token)",
  link_inactive: "Link was deactivated",
  no_fixed_amount: "Open-amount link (not checkable)",
  blocked_address: "Payer is blocked",
  fee_leg_missing: "Platform fee not included",
};

function formatDate(iso: string): string {
  return formatUtc(iso);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const PAGE_SIZE = 50;

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<"" | PaymentStatus>(() => {
    if (typeof window === "undefined") return "";
    return (sessionStorage.getItem("admin-payments-filter") as "" | PaymentStatus) || "";
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [total, setTotal] = useState<number | null>(null);

  async function fetchPage(status: string, offset: number): Promise<Payment[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const res = await fetch(`${API_BASE}/admin/payments?${params.toString()}`, { credentials: "include" });
    if (!res.ok) return [];
    const body = await res.json();
    if (Array.isArray(body)) {
      setTotal(null);
      return body;
    }
    setTotal(typeof body.total === "number" ? body.total : null);
    return Array.isArray(body.items) ? body.items : [];
  }

  async function load(status: string) {
    setLoading(true);
    setPayments(await fetchPage(status, 0));
    setLoading(false);
  }

  async function loadMore() {
    setLoadingMore(true);
    const next = await fetchPage(filter, payments.length);
    setPayments((prev) => [...prev, ...next]);
    setLoadingMore(false);
  }

  useEffect(() => {
    sessionStorage.setItem("admin-payments-filter", filter);
    (async () => {
      await load(filter);
    })();
  }, [filter]);

  async function changeStatus(payment: Payment, status: PaymentStatus) {
    if (status === payment.status) return;

    const flagDescription = payment.flag_reason
      ? FLAG_LABEL[payment.flag_reason] ?? payment.flag_reason
      : null;
    const consequence =
      status === "paid" && (payment.status === "disputed" || payment.status === "held")
        ? `This will clear the "${payment.status}" flag${flagDescription ? ` (${flagDescription})` : ""} and mark the payment as paid.`
        : `This will change the payment status from "${payment.status}" to "${status}".`;
    if (!window.confirm(`${consequence}\n\nAre you sure?`)) return;

    const reason = window.prompt(
      `Reason for marking this payment "${status}" (required, shown in the activity log):`,
      ""
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required for every payment status change.");
      return;
    }

    setPendingId(payment.id);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/admin/payments/${payment.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not update this payment.");
      }
      await load(filter);
    } catch (err) {
      reportError(err, { scope: "admin-payments", action: "payment-status-change", paymentId: payment.id });
      setError(err instanceof Error ? err.message : "Could not update this payment.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <h1>Payments</h1>

      <div className="admin-inline-form">
        <div className="field">
          <label htmlFor="filter">Filter by status</label>
          <select id="filter" value={filter} onChange={(e) => setFilter(e.target.value as "" | PaymentStatus)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner stallThreshold={3000} />
        ) : error && payments.length === 0 ? (
          <div className="empty">Could not load payments — try again.</div>
        ) : payments.length === 0 ? (
          <div className="empty">No payments match this filter.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Payer</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{p.merchant_name}</div>
                      <div className="mono">{p.merchant_email}</div>
                    </td>
                    <td className="mono">{formatAmount(p.amount_usdc, p.asset_code, "en-US")}</td>
                    <td className="mono">{shortAddress(p.payer_address)}</td>
                    <td>
                      <span className={`status-pill ${p.status}`}>{p.status}</span>
                      {p.flag_reason && (
                        <div style={{ color: "var(--text-lo)", fontSize: 12, marginTop: 4 }}>
                          {FLAG_LABEL[p.flag_reason] ?? p.flag_reason}
                        </div>
                      )}
                    </td>
                    <td>{formatDate(p.created_at)}</td>
                    <td>
                      <select
                        aria-label="Payment status"
                        value={p.status}
                        disabled={pendingId === p.id}
                        onChange={(e) => changeStatus(p, e.target.value as PaymentStatus)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && payments.length > 0 && (
          <div className="admin-pagination">
            <span>
              Showing {payments.length}
              {total !== null ? ` of ${total}` : ""}
            </span>
            {(total === null ? payments.length >= PAGE_SIZE : payments.length < total) && (
              <button type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
            {total === null && payments.length >= PAGE_SIZE && (
              <span style={{ color: "var(--text-lo)", fontSize: 12 }}>There may be more payments.</span>
            )}
          </div>
        )}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  );
}
