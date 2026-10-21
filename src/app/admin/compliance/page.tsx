"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiPost } from "@/lib/api";

interface BlockedAddress {
  id: string;
  stellar_address: string;
  reason: string | null;
  created_at: string;
  blocked_by_name: string | null;
}


export default function AdminCompliancePage() {
  const [blocked, setBlocked] = useState<BlockedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);

  async function load() {
    try {
      const data = await apiFetch<BlockedAddress[]>("/admin/compliance/blocked-addresses");
      setBlocked(data);
    } catch (err) {
      console.error("[konfirm admin] load blocked addresses failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function handleBlock(e: FormEvent) {
    e.preventDefault();
    if (!/^G[A-Z2-7]{55}$/.test(address.trim())) {
      setError("Enter a valid Stellar G... address.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiPost("/admin/compliance/blocked-addresses", {
        stellar_address: address.trim(),
        reason: reason || undefined,
      });
      setAddress("");
      setReason("");
      await load();
    } catch (err) {
      reportError(err, { tags: { area: "admin-compliance", action: "block-address" } });
      setError(err instanceof Error ? err.message : "Could not block this address.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnblock(entry: BlockedAddress) {
    if (!window.confirm(`Unblock ${entry.stellar_address}?`)) return;
    setPendingId(entry.id);
    setError("");
    try {
      await apiFetch(`/admin/compliance/blocked-addresses/${entry.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      reportError(err, { tags: { area: "admin-compliance", action: "unblock-address" } });
      setError(err instanceof Error ? err.message : "Could not unblock this address.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <h1>Compliance</h1>
      <p className="sub">
        A locally blocked address is rejected instantly on the Freighter checkout path — it never reaches the on-chain compliance
        check. The SEP-7/QR checkout path has no payer address at request time, so it isn&apos;t covered by this list either way.
      </p>

      <form onSubmit={handleBlock} className="admin-inline-form">
        <div className="field">
          <label htmlFor="address">Stellar address</label>
          <input
            id="address"
            type="text"
            placeholder="G..."
            autoComplete="off"
            spellCheck={false}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="reason">Reason (optional)</label>
          <input id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" className="primary" disabled={submitting}>
          Block
        </button>
      </form>
      {error && <div className="status error">{error}</div>}

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : loadError ? (
          <div className="empty">Could not load blocked addresses — try again.</div>
        ) : blocked.length === 0 ? (
          <div className="empty">No addresses blocked.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Reason</th>
                  <th>Blocked by</th>
                  <th>Since</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {blocked.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.stellar_address}</td>
                    <td>{b.reason || "—"}</td>
                    <td>{b.blocked_by_name || "—"}</td>
                    <td>{formatUtcTimestamp(b.created_at)}</td>
                    <td>
                      <button type="button" disabled={pendingId === b.id} onClick={() => handleUnblock(b)}>
                        Unblock
                      </button>
                    </td>
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
