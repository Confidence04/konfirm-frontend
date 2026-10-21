"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { explorerUrl } from "@/lib/stellar-explorer";

interface TreasuryStatus {
  contract_id: string;
  signers: string[];
  threshold: string;
  usdc_balance: string | null;
  reachable: boolean;
  wired_into_checkout: boolean;
  // Optional: not yet returned by the backend. Once
  // admin-treasury.service.ts includes it in the response, this page will
  // automatically link to the correct network's explorer instead of
  // falling back to testnet.
  network?: string;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export default function AdminTreasuryPage() {
  const [status, setStatus] = useState<TreasuryStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await apiFetch<TreasuryStatus>("/admin/treasury/status");
      if (result.ok) setStatus(result.data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!status) return <div className="empty">Could not load treasury status.</div>;

  return (
    <div>
      <h1>Treasury</h1>
      <p className="sub">
        The treasury Soroban contract, read live via its USDC balance. It is deployed and multi-sig-controlled, and now
        receives checkout&apos;s USDC-denominated fee revenue via a periodic sweep — not a direct call at checkout time (a
        Soroban invocation must be the only operation in its transaction, so the fee leg is a plain classic payment into a
        separate collection account first).
      </p>

      {status.wired_into_checkout && (
        <div className="status" style={{ marginBottom: 20 }}>
          USDC only — XLM- and EURC-denominated fee revenue is not swept into this contract, since it was initialized with
          a single token and can&apos;t custody other assets.
        </div>
      )}

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">USDC balance</div>
            <div className={`stat-value ${status.reachable ? "" : "stat-bad"}`}>
              {status.reachable ? `$${Number(status.usdc_balance).toFixed(2)}` : "unreachable"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Signer threshold</div>
            <div className="stat-value">{status.threshold}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Signers</div>
            <div className="stat-value">{status.signers.length}</div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h2>Contract</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">
                  <a href={explorerUrl(status.contract_id, status.network)} target="_blank" rel="noreferrer">
                    {status.contract_id}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>Signers ({status.signers.length})</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {status.signers.map((s) => (
                <tr key={s}>
                  <td className="mono">{shortAddress(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
