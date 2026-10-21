"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface LiveRate {
  rate: string | null;
  reachable: boolean;
}

interface Conversion {
  id: string;
  asset_code: string;
  payer_address: string;
  amount_usdc: string;
  fx_rate_to_usd: string;
  created_at: string;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}


const CONVERSIONS_PAGE_SIZE = 50;

export default function AdminExchangeRatePage() {
  const [live, setLive] = useState<LiveRate | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const [liveData, convData] = await Promise.all([
        apiFetch<LiveRate>("/admin/exchange-rate/live"),
        apiFetch<Conversion[]>("/admin/exchange-rate/conversions"),
      ]);
      if (liveData) setLive(liveData);
      if (convData) setConversions(convData);
      if (!liveData || !convData) setError(true);
      setLoading(false);
    })();
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const rows = await loadConversions(conversions.length);
      setConversions((prev) => [...prev, ...rows]);
      setHasMore(rows.length === CONVERSIONS_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <h1>Exchange Rate</h1>
      <p className="hint">
        Only XLM has a live conversion path today — sourced from Stellar&apos;s own order book (midpoint of best
        bid/ask), not a third-party price API. EURC is an allowed checkout currency in the database but isn&apos;t
        actually wired up to accept payments yet, so it has nothing to convert.
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="admin-section">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Live XLM/USDC rate</div>
                <div className={`stat-value ${live?.reachable === false ? "stat-bad" : ""}`}>
                  {live?.rate ?? (live?.reachable === false ? "unreachable" : "—")}
                </div>
                {live?.reachable === false && <div className="stat-sub">Could not reach Horizon testnet just now</div>}
              </div>
            </div>
          </div>

          <div className="admin-section">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Applied conversions</h2>
            {error ? (
              <div className="empty">Could not load exchange rate — try again.</div>
            ) : conversions.length === 0 ? (
              <div className="empty">No non-USDC payments have been converted yet.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Payer</th>
                      <th>Rate applied</th>
                      <th>USD-equivalent</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversions.map((c) => (
                      <tr key={c.id}>
                        <td>{c.asset_code}</td>
                        <td className="mono">{shortAddress(c.payer_address)}</td>
                        <td className="mono">{Number(c.fx_rate_to_usd).toFixed(7)}</td>
                        <td className="mono">${Number(c.amount_usdc).toFixed(2)}</td>
                        <td>{formatUtcTimestamp(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasMore && (
              <button type="button" onClick={handleLoadMore} disabled={loadingMore} style={{ marginTop: 12 }}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
