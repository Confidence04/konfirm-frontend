"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Summary {
  payment_count: number;
  total_fee_usdc: string;
}

interface DailyRow {
  day: string;
  payment_count: string;
  fee_usdc: string;
}

function formatDay(iso: string): string {
  return `${new Date(iso).toLocaleDateString(undefined, { timeZone: "UTC" })} UTC`;
}

// Client-side CSV export from the already-loaded daily rows (#20).
function downloadCsv(rows: DailyRow[]) {
  const header = "Day (UTC),Payments,Fee Revenue (USD)";
  const lines = rows.map((r) => `${r.day},${r.payment_count},${Number(r.fee_usdc).toFixed(2)}`);
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fee-revenue.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchFromBackend<T>(path: string, cookieHeader: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function AdminFeeRevenuePage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) {
    redirect("/admin/login");
  }

  const [summary, daily] = await Promise.all([
    fetchFromBackend<Summary>("/admin/fee-revenue/summary", cookieHeader),
    fetchFromBackend<DailyRow[]>("/admin/fee-revenue/daily", cookieHeader),
  ]);

  const dailyRows = daily ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1>Fee Revenue</h1>
        {!loading && daily.length > 0 && (
          <button type="button" onClick={() => downloadCsv(daily)}>
            Download CSV
          </button>
        )}
      </div>
      <p className="hint">
        Realized fee revenue only counts payments that actually settled (status = paid) — a refunded or disputed
        payment&apos;s fee was never really earned, so it&apos;s excluded here.
      </p>

      {loading ? (
        <LoadingSpinner stallThreshold={3000} />
      ) : (
        <>
          <div className="admin-section">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Total fee revenue</div>
                <div className="stat-value">{summary ? formatUsdc(summary.total_fee_usdc) : "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Paid transactions</div>
                <div className="stat-value">{summary?.payment_count ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        {dailyRows.length === 0 ? (
          <div className="empty">No settled payments in the last 30 days.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Payments</th>
                  <th>Fee revenue</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.day}>
                    <td>{formatDay(row.day)}</td>
                    <td className="mono">{row.payment_count}</td>
                    <td className="mono">{formatUsdc(row.fee_usdc)}</td>
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