"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { formatUtcTimestamp } from "@/lib/format-date";

interface ReconcilerStatus {
  value: string | null;
  updated_at: string | null;
}

function formatDate(iso: string | null): string {
  return iso ? formatUtcTimestamp(iso) : "—";
}

// Mirrors the backend's own guard (AdminReconcilerService) so an operator
// sees the constraint before the request round-trips, not after a 400.
function wouldMoveForward(current: string | null, target: string): string | null {
  if (!target) return null;
  if (target !== "now" && !/^\d+$/.test(target)) {
    return "Must be digits only, or the literal word \"now\".";
  }
  if (!current || current === "now") return null;
  if (target === "now") {
    return 'Cannot jump to "now" from a real position — that skips every unprocessed payment since then.';
  }
  if (BigInt(target) > BigInt(current)) {
    return "This is ahead of the current position — the cursor can only move backward.";
  }
  return null;
}

export default function AdminReconcilerPage() {
  const [status, setStatus] = useState<ReconcilerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function load() {
    const res = await fetch(`${API_BASE}/admin/reconciler/status`, { credentials: "include" });
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  const validationError = wouldMoveForward(status?.value ?? null, target.trim());

  async function handleRewind(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    if (validationError || !target.trim()) return;
    if (
      !window.confirm(
        "Rewinding the reconciler cursor is a rare, deliberately manual operation — see docs/RUNBOOK.md before doing this while the reconciler process is live. Continue?",
      )
    ) {
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError("");
    setResult("");
    try {
      const res = await fetch(`${API_BASE}/admin/reconciler/rewind`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor: target.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not rewind the cursor.");
      setResult(`Moved from ${body.previous} to ${body.value}.`);
      setTarget("");
      await load();
    } catch (err) {
      reportError(err, { context: "admin reconciler rewind failed" });
      setError(err instanceof Error ? err.message : "Could not rewind the cursor.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Reconciler</h1>
      <p className="sub">
        The reconciler watches Horizon and writes confirmed payments — this is its saved position. Rewinding is safe and idempotent
        (already-recorded payments are never duplicated), but it is a rare, deliberately manual operation, not a routine control.
      </p>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className="admin-status-row">
            <div>
              <div className="stat-label">Current cursor</div>
              <div className="mono">{status?.value ?? "—"}</div>
            </div>
            <div>
              <div className="stat-label">Last moved</div>
              <div className="mono">{formatDate(status?.updated_at ?? null)}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleRewind} className="admin-inline-form">
          <div className="field">
            <label htmlFor="cursor">Rewind to</label>
            <input
              id="cursor"
              type="text"
              placeholder="a Horizon paging token, or 'now'"
              autoComplete="off"
              spellCheck={false}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            {validationError && target && <div className="hint" style={{ color: "var(--error)" }}>{validationError}</div>}
          </div>
          <button type="submit" className="primary" disabled={submitting || !target.trim() || !!validationError}>
            Rewind
          </button>
        </form>
        {result && <div className="status">{result}</div>}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  );
}
