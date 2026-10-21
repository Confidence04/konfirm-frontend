"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatUtcTimestamp } from "@/lib/format";

interface WithdrawalAttempt {
  id: string;
  currency: string;
  anchor_tx_id: string;
  last_status: string | null;
  last_polled_at: string | null;
  created_at: string;
  merchant_name: string;
  merchant_email: string;
}

const TERMINAL_STATUSES = new Set(["completed", "error", "expired", "refunded"]);


export default function AdminWithdrawalsPage() {
  const [attempts, setAttempts] = useState<WithdrawalAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  async function load(showSpinner: boolean) {
    if (showSpinner) setLoading(true);
    const result = await apiFetch<WithdrawalAttempt[]>("/admin/withdrawal-attempts");
    if (result.ok && result.data) {
      setAttempts(result.data);
      setError(false);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load(true);
    })();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  const openCount = attempts.filter((a) => !a.last_status || !TERMINAL_STATUSES.has(a.last_status)).length;
  const completedCount = attempts.filter((a) => a.last_status === "completed").length;
  const failedCount = attempts.filter((a) => a.last_status && ["error", "expired", "refunded"].includes(a.last_status)).length;

  return (
    <div>
      <h1>Withdrawals</h1>
      <p className="sub">
        Cash-outs are a live proxy to Stellar&apos;s reference anchor — Konfirm has no local record of a withdrawal beyond this. Each
        row reflects the anchor&apos;s last known status; refreshing re-polls anything not yet finished. There is no admin action here
        beyond visibility — Konfirm has no authority to change the anchor&apos;s own transaction state.
      </p>

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-value">{attempts.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open</div>
            <div className="stat-value">{openCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Completed</div>
            <div className="stat-value stat-good">{completedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Failed</div>
            <div className="stat-value stat-bad">{failedCount}</div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <button type="button" onClick={handleRefresh} disabled={refreshing} style={{ width: "auto", marginBottom: 16 }}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="empty">Could not load withdrawals — try again.</div>
        ) : attempts.length === 0 ? (
          <div className="empty">No cash-outs have been started yet.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Currency</th>
                  <th>Anchor tx</th>
                  <th>Status</th>
                  <th>Last checked</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{a.merchant_name}</div>
                      <div className="mono">{a.merchant_email}</div>
                    </td>
                    <td>{a.currency}</td>
                    <td className="mono">{a.anchor_tx_id}</td>
                    <td>
                      {a.last_status ? (
                        <span className={`status-pill ${a.last_status}`}>{a.last_status}</span>
                      ) : (
                        <span className="hint">unknown</span>
                      )}
                    </td>
                    <td>{formatDate(a.last_polled_at)}</td>
                    <td>{formatDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
