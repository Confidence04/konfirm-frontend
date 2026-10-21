"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatAmount as formatCurrencyAmount } from "@/lib/format";

type SettlementStatus = "settled" | "failed" | "held";

interface Settlement {
  id: string;
  payer_address: string;
  pay_to: string;
  asset_contract: string;
  amount: string;
  resource_url: string | null;
  status: SettlementStatus;
  tx_hash: string | null;
  created_at: string;
}

const STATUS_OPTIONS: SettlementStatus[] = ["settled", "failed", "held"];

// x402 USDC amounts arrive in atomic units (7 decimals), unlike the
// existing payments table's already-decimal amount_usdc.
function formatAmount(amount: string): string {
  const n = Number(amount) / 10_000_000;
  return Number.isFinite(n) ? formatCurrencyAmount(n, "USDC") : amount;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

const PAGE_SIZE = 50;

export default function AdminX402SettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [filter, setFilter] = useState<"" | SettlementStatus>(() => {
    if (typeof window === "undefined") return "";
    return (sessionStorage.getItem("admin-x402-settlements-filter") as "" | SettlementStatus) || "";
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  async function load(nextOffset: number) {
    if (nextOffset === 0) setLoading(true);
    else setLoadingMore(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    const result = await apiFetch<Settlement[]>(`/admin/x402-settlements?${params.toString()}`);
    if (result.ok) {
      setSettlements((prev) => (nextOffset === 0 ? result.data : [...prev, ...result.data]));
      setOffset(nextOffset + result.data.length);
      setHasMore(result.data.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    (async () => {
      await load(0);
    })();
  }, [filter]);

  const counts = {
    settled: settlements.filter((s) => s.status === "settled").length,
    failed: settlements.filter((s) => s.status === "failed").length,
    held: settlements.filter((s) => s.status === "held").length,
  };
  const visible = filter ? settlements.filter((s) => s.status === filter) : settlements;

  return (
    <div>
      <h1>x402 Settlements</h1>
      <p className="sub">
        Per-request agent payments settled through Konfirm&apos;s x402 facilitator (the <code>exact</code> scheme on Stellar
        testnet). A &quot;held&quot; row is a request that passed protocol-level verification but was rejected by Konfirm&apos;s
        compliance check — the same blocklist and on-chain check that already protect checkout and the reconciler.
      </p>

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-value">{settlements.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Settled</div>
            <div className="stat-value stat-good">{counts.settled}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Failed</div>
            <div className="stat-value stat-bad">{counts.failed}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Held (compliance)</div>
            <div className="stat-value">{counts.held}</div>
          </div>
        </div>
      </div>

      <div className="filter-pills">
        <button type="button" className={`filter-pill ${filter === "" ? "active" : ""}`} onClick={() => setFilter("")}>
          All
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} type="button" className={`filter-pill ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="empty">Could not load settlements — try again.</div>
        ) : visible.length === 0 ? (
          <div className="empty">No settlements match this filter.</div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th>Pay to</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Tx hash</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{shortAddress(s.payer_address)}</td>
                      <td className="mono">{shortAddress(s.pay_to)}</td>
                      <td className="mono">{formatAmount(s.amount)}</td>
                      <td>
                        <span className={`status-pill ${s.status}`}>{s.status}</span>
                      </td>
                      <td className="mono">{s.tx_hash ? shortAddress(s.tx_hash) : "—"}</td>
                      <td>{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-pagination">
              <span className="sub">
                Showing {visible.length} of {settlements.length}
                {hasMore ? "+" : ""} loaded
                {filter ? ` (${filter} filter applied to loaded rows)` : ""}
              </span>
              {hasMore && (
                <button type="button" className="btn-secondary" disabled={loadingMore} onClick={() => load(offset)}>
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
