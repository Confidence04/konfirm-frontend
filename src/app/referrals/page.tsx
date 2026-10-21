"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useRequireAuth } from "@/lib/useAuth";

interface Merchant {
  name: string;
}

interface ReferralRow {
  name: string;
  email: string;
  created_at: string;
  activated: boolean;
}

interface Promo {
  active: boolean;
  feeBps: number | null;
  expiresAt: string | null;
  volumeCapUsdc: string | null;
  volumeSoFarUsdc: string;
}

interface ReferralsResponse {
  code: string | null;
  promo: Promo | null;
  referrals: ReferralRow[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function formatDaysLeft(days: number): string {
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function PromoBanner({ promo }: { promo: Promo }) {
  if (!promo.active) {
    return <div className="admin-section hint">Your promotional rate has ended — standard fees now apply.</div>;
  }
  const isFree = promo.feeBps === 0;
  const label = isFree ? "0% fees" : `${(promo.feeBps! / 100).toFixed(2)}% fees`;
  return (
    <div className="admin-section" style={{ borderColor: "var(--accent, #5b8def)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label} active{promo.expiresAt ? ` — ${formatDaysLeft(daysLeft(promo.expiresAt))}` : ""}</div>
      {promo.volumeCapUsdc && (
        <div className="hint">
          {formatAmount(promo.volumeSoFarUsdc, "USDC")} of {formatAmount(promo.volumeCapUsdc, "USDC")} processed at this rate
        </div>
      )}
    </div>
  );
}

export default function ReferralsPage() {
  const { resolved } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  const [data, setData] = useState<ReferralsResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [copyAnnouncement, setCopyAnnouncement] = useState("");

  const COPY_FEEDBACK_MS = 4000;

  useEffect(() => {
    if (!resolved) return;
    (async () => {
      const res = await apiFetch<ReferralsResponse>("/auth/me/referrals");
      if (res.ok) setData(res.data);
    })();
  }, [resolved]);

  if (!resolved) return null;

  const referralUrl = data?.code ? `${window.location.origin}/signup?ref=${data.code}` : null;

  async function copyLink() {
    if (!referralUrl) return;
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      setCopyError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopyError(false);
      setCopied(true);
      setCopyAnnouncement("Referral link copied to clipboard.");
      setTimeout(() => {
        setCopied(false);
        setCopyAnnouncement("");
      }, COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
      <h1>Refer other merchants</h1>

      {!data ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          {data.promo && <PromoBanner promo={data.promo} />}

          <div className="admin-section">
            <p>Share your link. Anyone who signs up through it is automatically credited to you — no code to remember.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code className="mono" style={{ padding: "8px 12px", background: "var(--surface)", borderRadius: 8 }}>
                {referralUrl}
              </code>
              <button type="button" onClick={copyLink}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <div role="status" aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
              {copyAnnouncement}
            </div>
            {copyError && (
              <div className="hint" role="alert" style={{ marginTop: 8 }}>
                Couldn&apos;t copy — select and copy the link manually.
              </div>
            )}
          </div>

          <div className="admin-section">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>People you&apos;ve referred</h2>
            {data.referrals.length === 0 ? (
              <div className="empty">Nobody yet — share your link above.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Status</th>
                      <th>Referred</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrals.map((r) => (
                      <tr key={r.email}>
                        <td>
                          <div style={{ color: "var(--text-hi)" }}>{r.name}</div>
                          <div className="mono">{r.email}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${r.activated ? "paid" : "pending"}`}>
                            {r.activated ? "Active" : "Signed up"}
                          </span>
                        </td>
                        <td>{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
