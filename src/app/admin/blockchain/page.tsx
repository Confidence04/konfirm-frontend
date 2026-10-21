"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { explorerUrl } from "@/lib/stellar-explorer";

interface BlockchainStatus {
  network: string;
  facilitator: {
    address: string;
    reachable: boolean;
    balances: { asset: string; balance: string }[];
  };
  rpc: { reachable: boolean; latencyMs: number | null; latestLedger: number | null };
  contracts: { name: string; id: string }[];
}

export default function AdminBlockchainPage() {
  const [status, setStatus] = useState<BlockchainStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await apiFetch<BlockchainStatus>("/admin/blockchain/status");
      if (result.ok) setStatus(result.data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!status) return <div className="empty">Could not load blockchain status.</div>;

  return (
    <div>
      <h1>Blockchain</h1>
      <p className="sub">
        Live reads from Stellar {status.network} — the facilitator&apos;s own balance, Soroban RPC reachability, and the four
        deployed contracts. Nothing here is cached; every load asks the chain again.
      </p>

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Facilitator XLM</div>
            <div className={`stat-value ${status.facilitator.reachable ? "" : "stat-bad"}`}>
              {status.facilitator.reachable
                ? status.facilitator.balances.find((b) => b.asset === "XLM")?.balance ?? "—"
                : "unreachable"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">RPC status</div>
            <div className={`stat-value ${status.rpc.reachable ? "stat-good" : "stat-bad"}`} style={{ fontSize: 20 }}>
              {status.rpc.reachable ? "reachable" : "unreachable"}
            </div>
            {status.rpc.reachable && status.rpc.latencyMs !== null && (
              <div className="stat-sub">{status.rpc.latencyMs}ms</div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Latest ledger</div>
            <div className="stat-value">{status.rpc.latestLedger ?? "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Contracts deployed</div>
            <div className="stat-value">{status.contracts.length}</div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h2>Facilitator account</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Asset</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {status.facilitator.balances.length === 0 ? (
                <tr>
                  <td className="mono">{status.facilitator.address}</td>
                  <td colSpan={2}>
                    <span className="hint">unreachable</span>
                  </td>
                </tr>
              ) : (
                status.facilitator.balances.map((b) => (
                  <tr key={b.asset}>
                    <td className="mono">{status.facilitator.address}</td>
                    <td>{b.asset}</td>
                    <td className="mono">{b.balance}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>Deployed contracts</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {status.contracts.map((c) => (
                <tr key={c.id}>
                  <td style={{ color: "var(--text-hi)" }}>{c.name}</td>
                  <td className="mono">
                    <a href={explorerUrl(c.id, status.network)} target="_blank" rel="noreferrer">
                      {c.id}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
