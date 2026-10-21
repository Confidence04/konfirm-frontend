"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/format";

interface PayLink {
  id: string;
  merchant_name: string;
  amount_usdc: string | null;
  currency: string;
  description: string | null;
  reusable: boolean;
  max_uses: number | null;
  expires_at: string | null;
  active: boolean;
  created_at: string;
  use_count: number;
  net_usdc: string;
}




const PAGE_SIZE = 50;

export default function AdminPayLinksPage() {
  const [links, setLinks] = useState<PayLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await apiFetch<PayLink[]>(`/admin/links?limit=${PAGE_SIZE}&offset=0`);
      if (result.ok) {
        setLinks(result.data);
        setHasMore(result.data.length === PAGE_SIZE);
      }
      setLoading(false);
    })();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const nextOffset = offset + PAGE_SIZE;
    const result = await apiFetch<PayLink[]>(`/admin/links?limit=${PAGE_SIZE}&offset=${nextOffset}`);
    if (result.ok) {
      setLinks((prev) => [...prev, ...result.data]);
      setOffset(nextOffset);
      setHasMore(result.data.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  const activeCount = links.filter((l) => l.active).length;
  const reusableCount = links.filter((l) => l.reusable).length;
  const totalCollected = links.reduce((sum, l) => sum + Number(l.net_usdc), 0);

  return (
    <div>
      <h1>Pay Links</h1>
      <p className="sub">
        Shareable checkout links created by merchants (the same links served at <code>/pay/[linkId]</code>). A link with no fixed
        amount is pay-what-you-want; a reusable link can be paid more than once, up to its max uses if one is set.
      </p>

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Links loaded</div>
            <div className="stat-value">{links.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active (loaded)</div>
            <div className="stat-value stat-good">{activeCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Reusable (loaded)</div>
            <div className="stat-value">{reusableCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Collected via loaded links</div>
            <div className="stat-value">${totalCollected.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="empty">Could not load pay links — try again.</div>
        ) : links.length === 0 ? (
          <div className="empty">No pay links have been created yet.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Uses</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td style={{ color: "var(--text-hi)" }}>{l.merchant_name}</td>
                    <td className="mono">
                      {l.amount_usdc === null ? "Any amount" : formatAmount(l.amount_usdc, l.currency)}
                    </td>
                    <td>{l.description || "—"}</td>
                    <td className="mono">
                      {l.use_count}
                      {l.max_uses ? ` / ${l.max_uses}` : l.reusable ? "" : " / 1"}
                    </td>
                    <td>
                      <span className={`status-pill ${l.active ? "active" : "suspended"}`}>{l.active ? "active" : "inactive"}</span>
                    </td>
                    <td>{formatUtcDateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && links.length > 0 && (
          <div className="admin-pagination" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <span className="sub" style={{ margin: 0 }}>
              Showing {links.length}
              {hasMore ? "+" : ""} {hasMore ? "of at least" : "of"} {links.length}
              {hasMore ? " (more available)" : ""}
            </span>
            {hasMore && (
              <button className="btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
