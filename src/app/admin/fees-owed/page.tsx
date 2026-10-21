"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface FeesOwedRow {
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
  asset_code: string;
  total_owed: string;
  oldest_owed_at: string;
}

function formatAmount(amount: string, code: string): string {
  return code === "USDC" ? `$${Number(amount).toFixed(2)}` : `${Number(amount).toFixed(2)} ${code}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC";
}

export default function AdminFeesOwedPage() {
  const [rows, setRows] = useState<FeesOwedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await apiFetch<FeesOwedRow[]>("/admin/fees/owed");
      if (!result.ok || result.data === null) {
        setError(true);
      } else {
        setRows(result.data);
      }
      setLoading(false);
    })();
  }, []);

  const totalMerchants = new Set(rows.map((r) => r.merchant_id)).size;

  return (
    <div>
      <h1>Fees Owed</h1>
      <p className="hint">
        Merchants with outstanding platform fees — amounts accrued but not yet settled. A merchant in arrears can be
        handled through the suspend action on the Merchants page.
      </p>

      <div className="admin-section">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : error ? (
          <div className="empty">Could not load fees owed — try again.</div>
        ) : rows.length === 0 ? (
          <div className="empty">No outstanding fees — all merchants are current.</div>
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="stat-label">Merchants in arrears</div>
                <div className="stat-value">{totalMerchants}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Outstanding line items</div>
                <div className="stat-value">{rows.length}</div>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Asset</th>
                    <th>Total Owed</th>
                    <th>Oldest Owed Since (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.merchant_id}-${row.asset_code}`}>
                      <td>
                        <div style={{ color: "var(--text-hi)" }}>{row.merchant_name}</div>
                        <div className="mono">{row.merchant_email}</div>
                      </td>
                      <td className="mono">{row.asset_code}</td>
                      <td className="mono">{formatAmount(row.total_owed, row.asset_code)}</td>
                      <td>{formatDate(row.oldest_owed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
