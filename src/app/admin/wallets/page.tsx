"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface WalletRow {
  address: string;
  roles: string[];
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const ROLE_LABELS: Record<string, string> = {
  payer: "Payer",
  merchant: "Merchant",
  blocked: "Blocked",
};

const PAGE_SIZE = 50;

export default function AdminWalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/admin/wallets?limit=${PAGE_SIZE}&offset=0`, { credentials: "include" });
      if (res.ok) {
        const rows: WalletRow[] = await res.json();
        setWallets(rows);
        setOffset(rows.length);
        setHasMore(rows.length === PAGE_SIZE);
      }
      setLoading(false);
    })();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const res = await fetch(`${API_BASE}/admin/wallets?limit=${PAGE_SIZE}&offset=${offset}`, { credentials: "include" });
    if (res.ok) {
      const rows: WalletRow[] = await res.json();
      setWallets((prev) => [...prev, ...rows]);
      setOffset((prev) => prev + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  return (
    <div>
      <h1>Wallets</h1>
      <p className="hint">
        Every Stellar address seen across payments, merchant accounts, and the compliance blocklist, in one directory
        — an address showing both &quot;Payer&quot; and &quot;Blocked&quot; is worth a second look.
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="empty">Could not load wallets — try again.</div>
      ) : wallets.length === 0 ? (
        <div className="empty">No addresses seen yet.</div>
      ) : (
        <div className="admin-section">
          <p className="hint">
            Showing {wallets.length} of {hasMore ? "many" : wallets.length}
            {hasMore ? " — there may be more rows." : ""}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.address}>
                    <td className="mono">{shortAddress(w.address)}</td>
                    <td>
                      {w.roles.map((role) => (
                        <span key={role} className={`status-pill ${role === "blocked" ? "disputed" : "paid"}`} style={{ marginRight: 6 }}>
                          {ROLE_LABELS[role] ?? role}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <button className="btn" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 12 }}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
