"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { formatAmount } from "@/lib/format";

interface Stats {
  merchants: { total: number; active: number; suspended: number; pending: number };
  payments: { today_count: number; today_net_usdc: string; last_7d_net_usdc: string };
  daily_volume: { date: string; net_usdc: string }[];
  compliance: { blocked_count: number };
  reconciler: { cursor: string | null; updated_at: string | null };
  withdrawals: { open_count: number };
}

interface ActivityEntry {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: { reason?: string } | null;
  created_at: string;
  admin_name: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}


function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short" });
}

// A small hand-rolled SVG area chart — this app has no charting dependency,
// and one 7-point series doesn't need one. Real values in, real path out;
// nothing here is decorative.
function VolumeChart({
  points,
  totalUsdc,
}: {
  points: { date: string; net_usdc: string }[];
  totalUsdc: string;
}) {
  const width = 640;
  const height = 160;
  const padding = 8;
  const values = points.map((p) => Number(p.net_usdc));
  const max = Math.max(...values, 1);
  const step = (width - padding * 2) / (points.length - 1 || 1);

  const coords = values.map((v, i) => {
    const x = padding + i * step;
    const y = height - padding - (v / max) * (height - padding * 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0]},${height} L${coords[0][0]},${height} Z`;

  const firstDate = points[0]?.date;
  const lastDate = points[points.length - 1]?.date;
  const rangeLabel =
    firstDate && lastDate ? `${firstDate} to ${lastDate}` : "last 7 days";
  const ariaLabel = `Payment volume chart, ${rangeLabel}: ${formatUsd(totalUsdc)} total net USDC across ${points.length} days.`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="volume-chart"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <path d={areaPath} className="volume-chart-fill" />
      <path d={linePath} className="volume-chart-line" />
      {coords.map(([x, y], i) => (
        <circle key={points[i].date} cx={x} cy={y} r={3} className="volume-chart-dot" />
      ))}
    </svg>
  );
}

// Screen-reader-only table of the same data the chart draws, so the per-day
// values are available to assistive technology rather than only visually.
function VolumeTable({ points }: { points: { date: string; net_usdc: string }[] }) {
  return (
    <table className="visually-hidden">
      <caption>Payment volume, last 7 days</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Net volume (USDC)</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.date}>
            <th scope="row">{p.date}</th>
            <td>{formatUsd(p.net_usdc)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);

  useEffect(() => {
    (async () => {
      const [statsResult, activityResult] = await Promise.all([
        apiFetch<Stats>("/admin/stats"),
        apiFetch<ActivityEntry[]>("/admin/activity"),
      ]);
      if (statsResult.data) setStats(statsResult.data);
      if (activityResult.data) setActivity(activityResult.data);
      else setActivityError(true);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return <div className="empty">Could not load stats.</div>;

  return (
    <div>
      <h1>Overview</h1>

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Merchants</div>
            <div className="stat-value">{stats.merchants.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value stat-good">{stats.merchants.active}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Suspended</div>
            <div className="stat-value stat-bad">{stats.merchants.suspended}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Payments today</div>
            <div className="stat-value">{stats.payments.today_count}</div>
            <div className="stat-sub">{formatAmount(stats.payments.today_net_usdc, "USDC")} net</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Blocked addresses</div>
            <div className="stat-value">{stats.compliance.blocked_count}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open cash-outs</div>
            <div className="stat-value">{stats.withdrawals.open_count}</div>
            <div className="stat-sub">not yet completed/errored per the anchor</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Reconciler last moved</div>
            <div className="stat-value" style={{ fontSize: 15 }}>
              {stats.reconciler.updated_at ? formatDate(stats.reconciler.updated_at) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h2>Payment volume, last 7 days ({formatAmount(stats.payments.last_7d_net_usdc, "USDC")} total)</h2>
        <div className="chart-card">
          <VolumeChart
            points={stats.daily_volume}
            totalUsdc={stats.payments.last_7d_net_usdc}
          />
          <div className="chart-labels">
            {stats.daily_volume.map((p) => (
              <span key={p.date}>{dayLabel(p.date)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h2>Recent activity</h2>
        {activityError ? (
          <div className="empty">Could not load activity — try again.</div>
        ) : activity.length === 0 ? (
          <div className="empty">No admin actions yet.</div>
        ) : (
          <ul className="activity-feed">
            {activity.map((a) => (
              <li key={a.id}>
                <span className="when">{formatDate(a.created_at)}</span>
                <span className="who">{a.admin_name}</span> {a.action.replaceAll(".", " ")} {a.target_type} {a.target_id.slice(0, 8)}
                {a.detail?.reason && <> — &ldquo;{a.detail.reason}&rdquo;</>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
