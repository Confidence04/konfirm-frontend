"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch, apiPatch, apiPost } from "@/lib/api";

type RiskTier = "unverified" | "standard" | "established" | "enterprise";

interface Merchant {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "suspended";
  risk_tier: RiskTier;
  stellar_base_address: string | null;
  created_at: string;
}

const RISK_TIERS: RiskTier[] = ["unverified", "standard", "established", "enterprise"];

function formatDate(iso: string): string {
  return formatUtcTimestamp(iso);
}

function shortAddress(address: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function load() {
    try {
      const data = await apiFetch<Merchant[]>("/admin/merchants");
      setMerchants(data);
    } catch (err) {
      console.error("[konfirm admin] merchants load failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    await load(merchants.length);
  }

  async function sendPasswordReset(merchant: Merchant) {
    if (inFlight.current) return;
    if (!window.confirm(`Email a password-reset link to ${merchant.email}?`)) return;
    const reason = window.prompt("Why? Required, shown in the activity log:", "");
    if (!reason || reason.trim().length < 3) {
      setError("A reason of at least 3 characters is needed to send a reset.");
      return;
    }
    inFlight.current = true;
    setPendingId(merchant.id);
    setError("");
    try {
      await apiPost(`/admin/merchants/${merchant.id}/password-reset`, { reason: reason.trim() });
      setError("");
      window.alert(`Reset link sent to ${merchant.email}.`);
    } catch (err) {
      reportError(err, { action: "admin.merchant.password_reset", merchantId: merchant.id });
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }

  async function toggleStatus(merchant: Merchant) {
    if (inFlight.current) return;
    const nextStatus = merchant.status === "suspended" ? "active" : "suspended";
    const verb = nextStatus === "suspended" ? "suspend" : "reactivate";
    const confirmMessage =
      nextStatus === "suspended"
        ? `Suspend ${merchant.name} (${merchant.email})?\n\nWhile suspended, this merchant cannot sign in to the dashboard or receive new payments; their existing links stop accepting payments until they're reactivated.`
        : `Reactivate ${merchant.name} (${merchant.email})?\n\nThis restores their ability to sign in and accept payments.`;
    if (!window.confirm(confirmMessage)) return;

    let reason: string | null = "";
    if (verb === "suspend") {
      reason = window.prompt("Reason (optional, shown in the activity log):", "");
      if (reason === null) return;
    }

    inFlight.current = true;
    setPendingId(merchant.id);
    setError("");
    try {
      await apiPatch(`/admin/merchants/${merchant.id}/status`, {
        status: nextStatus,
        reason: reason || undefined,
      });
      await load();
    } catch (err) {
      reportError(err, { action: "admin.merchant.status_change", merchantId: merchant.id, status: nextStatus });
      setError(err instanceof Error ? err.message : `Could not ${verb} this merchant.`);
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }

  async function changeTier(merchant: Merchant, riskTier: RiskTier) {
    if (inFlight.current) return;
    if (riskTier === merchant.risk_tier) return;
    // This changes what tier a merchant is TREATED as, not their actual
    // verification status — there's no identity/KYC check behind this yet,
    // so the confirm copy says so rather than implying otherwise.
    if (
      !window.confirm(
        `Set ${merchant.name} (${merchant.email}) to "${riskTier}"?\n\nThis only changes which tier they're treated as — it does not perform any identity verification.`,
      )
    )
      return;

    inFlight.current = true;
    setPendingId(merchant.id);
    setError("");
    try {
      await apiPatch(`/admin/merchants/${merchant.id}/tier`, { risk_tier: riskTier });
      await load();
    } catch (err) {
      reportError(err, { action: "admin.merchant.tier_change", merchantId: merchant.id, riskTier });
      setError(err instanceof Error ? err.message : "Could not change this merchant's tier.");
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }

  return (
    <div>
      <h1>Merchants</h1>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : loadError ? (
          <div className="empty">Could not load merchants — try again.</div>
        ) : merchants.length === 0 ? (
          <div className="empty">No merchants yet.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Status</th>
                  <th>Risk tier</th>
                  <th>Stellar address</th>
                  <th>Created (UTC)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{m.name}</div>
                      <div className="mono">{m.email}</div>
                    </td>
                    <td>
                      <span className={`status-pill ${m.status}`}>{m.status}</span>
                    </td>
                    <td>
                      <select
                        aria-label="Risk tier"
                        value={m.risk_tier}
                        disabled={pendingId === m.id}
                        onChange={(e) => changeTier(m, e.target.value as RiskTier)}
                      >
                        {RISK_TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{shortAddress(m.stellar_base_address)}</td>
                    <td>{formatDate(m.created_at)}</td>
                    <td>
                      <div className="button-group">
                        <button type="button" disabled={pendingId === m.id} onClick={() => toggleStatus(m)}>
                          {m.status === "suspended" ? "Reactivate" : "Suspend"}
                        </button>
                        <button
                          type="button"
                          disabled={pendingId === m.id || m.status !== "active"}
                          onClick={() => sendPasswordReset(m)}
                          title={m.status !== "active" ? "Reactivate the account first" : undefined}
                        >
                          Send reset
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && merchants.length > 0 && (
          <div className="admin-pagination">
            <span>
              Showing {merchants.length} merchant{merchants.length === 1 ? "" : "s"}
              {merchants.length % PAGE_SIZE === 0 ? " — there may be more" : ""}
            </span>
            {merchants.length % PAGE_SIZE === 0 && (
              <button type="button" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  );
}