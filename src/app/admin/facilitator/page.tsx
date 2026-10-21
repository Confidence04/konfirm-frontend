"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/format";

interface FacilitatorStatus {
  halted: boolean;
  haltedAt: string | null;
  haltReason: string | null;
  spentTodayUsdc: number;
  capUsdc: number;
  capConfigured?: boolean;
}

export default function AdminFacilitatorPage() {
  const [status, setStatus] = useState<FacilitatorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const result = await apiFetch<FacilitatorStatus>("/admin/facilitator/status");
    if (result.ok) setStatus(result.data);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function resume() {
    if (
      !window.confirm(
        "Resume facilitator signing?\n\nThis clears the halt but does not reset today's spend against the cap — if the cap is still exceeded, the very next sweep will halt it again.",
      )
    )
      return;
    setResuming(true);
    setError("");
    try {
      const res = await apiPost("/admin/facilitator/resume");
      if (!res.ok) throw new Error(res.message || "Could not resume facilitator signing.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume facilitator signing.");
    } finally {
      setResuming(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (!status) return <div className="empty">Could not load facilitator status.</div>;

  return (
    <div>
      <h1>Facilitator</h1>
      <p className="sub">
        The daily spend cap and halt switch guarding the facilitator&apos;s own treasury sweep — the one operation that
        moves the facilitator&apos;s own funds, as opposed to x402 settlement and channel operations, which only relay value
        between a payer and payee. A cap breach halts all further signing until resumed here.
      </p>

      {error && <div className="status error">{error}</div>}

      {!status.halted && (status.capConfigured === false || (status.capConfigured === undefined && status.capUsdc === 0)) && (
        <div className="status error" style={{ marginBottom: 20 }}>
          Daily spend cap not configured — the facilitator will halt on its next signing attempt.
        </div>
      )}

      {status.halted && (
        <div className="status error" style={{ marginBottom: 20 }}>
          Halted{status.haltedAt ? ` since ${formatUtcTimestamp(status.haltedAt)}` : ""}
          {status.haltReason ? ` — ${status.haltReason}` : ""}
        </div>
      )}

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Signing status</div>
            <div className={`stat-value ${status.halted ? "stat-bad" : ""}`}>{status.halted ? "Halted" : "Active"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Spent today</div>
            <div className="stat-value">{formatAmount(status.spentTodayUsdc, "USDC")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Daily cap</div>
            <div className="stat-value">{formatAmount(status.capUsdc, "USDC")}</div>
          </div>
        </div>
      </div>

      {status.halted && (
        <div className="admin-section">
          <button type="button" onClick={resume} disabled={resuming}>
            {resuming ? "Resuming…" : "Resume signing"}
          </button>
        </div>
      )}
    </div>
  );
}
