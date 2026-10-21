"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE, apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import { formatAmount } from "@/lib/format";
import FeeSettlement from "@/components/fee-settlement";

type PaymentStatus = "paid" | "held" | "refunded" | "disputed";

interface Payment {
  id: string;
  net_usdc: string;
  asset_code: string;
  payer_address: string;
  link_description: string | null;
  status: PaymentStatus;
  flag_reason: string | null;
  fee_status: "none" | "collected" | "owed" | "claimed" | "settled";
  fee_owed_raw: string | null;
  fee_asset_code: string | null;
  created_at: string;
}

const STATUS_FILTERS: Array<{ value: "all" | PaymentStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "held", label: "Held" },
  { value: "refunded", label: "Refunded" },
  { value: "disputed", label: "Disputed" },
];

type DateRangePreset = "all" | "7" | "30" | "90";

const DATE_RANGE_FILTERS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

// Plain-language reasons for an admin-review hold, shown to the merchant.
// Anything unrecognised falls back to a neutral line rather than leaking an
// internal code name.
const HOLD_REASON_TEXT: Record<string, string> = {
  amount_mismatch: "Amount didn't match the payment link — under review",
  asset_mismatch: "Paid in a different asset than the link — under review",
  issuer_mismatch: "Asset didn't match the expected token — under review",
  no_session: "Not linked to a payment link — under review",
  link_inactive: "Link was deactivated before this payment — under review",
  no_fixed_amount: "Open-amount link — under review",
  blocked_address: "Payer flagged by compliance — under review",
};
const HOLD_FALLBACK = "Held for review";

// How many consecutive failed polls before we stop claiming to be "live" and
// warn the merchant. A single blip shouldn't flash a scary banner.
const POLL_FAILURE_THRESHOLD = 2;

interface Merchant {
  name: string;
  stellar_base_address: string | null;
}

// The dashboard is only ever the logged-in merchant's own data. There's no
// address-in-the-URL view any more: the backend returns payments by session,
// so an unauthenticated visitor sees nothing.
function ActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdminPreview = Boolean(searchParams.get("admin_preview"));
  const { resolved, data: merchant } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  // Gate render on auth resolution — prevents a false "$0.00 received"
  // from flashing before the first fetch completes (#135).
  if (!resolved) {
    return (
      <div className="wrap">
        <div className="header-row">
          <div className="brand">
            <span className="mark">✓</span> Konfirm
          </div>
        </div>
        <div className="empty">Loading…</div>
      </div>
    );
  }

  const hasAddress = Boolean(merchant?.stellar_base_address);
  const showNav = Boolean(merchant);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pending, setPending] = useState(false);
  const [pollError, setPollError] = useState(false);

  const poll = useCallback(async () => {
    if (!hasAddress) return;
    try {
      const [paymentsRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE}/payments/mine`),
        fetch(`${API_BASE}/payments/mine/pending`),
      ]);
      if (!paymentsRes.ok || !pendingRes.ok) {
        setPollError(true);
        return;
      }
      const paymentsBody: Payment[] = await paymentsRes.json();
      const pendingBody = await pendingRes.json();
      setPayments(paymentsBody);
      setPending(Boolean(pendingBody.pending));
      setPollError(false);
    } catch {
      setPollError(true);
    }
  }, [hasAddress]);

  // The recursive scheduling lives here, in a plain local function, rather
  // than inside the `poll` callback referencing itself — a useCallback
  // can't safely call itself by name before its own declaration finishes
  // binding on each render.
  //
  // Polling is visibility-aware: a background tab doesn't need live updates,
  // so we stop the loop while `document.hidden` and resume (with an immediate
  // re-poll) when the tab becomes visible again. This keeps a dashboard left
  // open all day from generating continuous backend load.
  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(loop, 3000);
    }

    async function loop() {
      if (cancelled) return;
      if (document.hidden) return;
      await poll();
      if (!cancelled) schedule();
    }

    function handleVisibility() {
      if (cancelled) return;
      if (document.hidden) {
        clearTimeout(timer);
      } else {
        // Resume and immediately re-poll so the merchant sees fresh data.
        clearTimeout(timer);
        loop();
      }
    }

    loop();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [resolved, poll]);

  async function handleLogout() {
    await apiPost("/auth/logout");
    router.push("/login");
  }

  // Held payments are listed but never counted as received until an admin
  // clears them.
  const totals: Record<string, number> = {};
  payments
    .filter((p) => p.status === "paid")
    .forEach((p) => {
      totals[p.asset_code] = (totals[p.asset_code] || 0) + Number(p.net_usdc);
    });
  const hasBalances = Object.keys(totals).length > 0;

  // Hold off rendering the dashboard shell (nav, actions, fee settlement)
  // until the client-side auth check resolves — the edge proxy only checks
  // cookie presence, so an expired session would otherwise briefly expose a
  // fully interactive page.
  if (!resolved) return null;

  return (
    <div className="wrap">
      {isAdminPreview && (
        <div
          role="banner"
          style={{
            background: "var(--warn, #b45309)",
            color: "#fff",
            padding: "10px 16px",
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 6,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚠</span>
          Admin preview — you are viewing this merchant&apos;s dashboard as an admin. This session is read-only and has been logged.
        </div>
      )}
      <div className="header-row">
        <div className="brand">
          <span className="mark">✓</span> Konfirm
        </div>
        {showNav && (
          <div className="nav">
            <Link href="/new">+ New payment</Link>
            <Link href="/links">My links</Link>
            <Link href="/cashout">Cash out</Link>
            <Link href="/referrals">Referrals</Link>
            <Link href="/docs">Docs</Link>
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
      <h1>{merchant?.name ? `${merchant.name}'s activity` : "Your activity"}</h1>
      <p className="sub">Every payment below landed and was konfirmed on-chain — nothing here is an estimate.</p>
      {pollError ? (
        <div className="waiting-banner show" role="status">
          <span className="spin" /> Having trouble reaching the server — retrying…
        </div>
      ) : (
        <div className="live-dot">
          <span className="d" /> Watching for new payments
        </div>
      )}
      <div className={`waiting-banner${pending ? " show" : ""}`}>
        <span className="spin" /> A payment is on its way — konfirming on-chain now…
      </div>
      {merchant?.stellar_base_address && <FeeSettlement address={merchant.stellar_base_address} />}
      <div className="balance">
        {hasBalances ? (
          Object.entries(totals).map(([code, amount]) => (
            <div key={code}>
              {formatAmount(amount, code)} <small>received</small>
            </div>
          ))
        ) : (
          <>
            {formatAmount(0, "USDC")} <small>received</small>
          </>
        )}
      </div>
      {hasAddress && payments.length > 0 && (
        <div className="header-row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field">
            <label htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | PaymentStatus)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date-filter">Date range</label>
            <select id="date-filter" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateRangePreset)}>
              {DATE_RANGE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div>
        {!hasAddress && <div className="empty">No Stellar address on file yet.</div>}
        {hasAddress && payments.length === 0 && !pending && (
          <div className="empty">No payments yet — this updates the instant one lands.</div>
        )}
        {hasAddress && payments.length > 0 && filteredPayments.length === 0 && (
          <div className="empty">No payments match this filter.</div>
        )}
        {filteredPayments.map((p) => {
          const isExpanded = expandedId === p.id;
          return (
            <div
              className="payment"
              key={p.id}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onClick={() => setExpandedId(isExpanded ? null : p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedId(isExpanded ? null : p.id);
                }
              }}
              style={{ cursor: "pointer", flexDirection: "column", alignItems: "stretch" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <div className="left">
                  <div className="tick">✓</div>
                  <div className="desc">
                    {p.link_description || "Payment"}
                    <div className="from">
                      from {p.payer_address.slice(0, 4)}…{p.payer_address.slice(-4)}
                    </div>
                    {p.fee_status === "owed" && p.fee_owed_raw && (
                      <div className="from">
                        Fee owed {p.fee_owed_raw} {p.fee_asset_code}
                      </div>
                    )}
                    {p.status === "held" && (
                      <div className="from" role="status">
                        {HOLD_REASON_TEXT[p.flag_reason ?? ""] ?? HOLD_FALLBACK}
                      </div>
                    )}
                  </div>
                </div>
                <div className="amount">
                  {p.status === "held" ? "On hold" : formatAmount(Number(p.net_usdc), p.asset_code)}
                </div>
              </div>
              {isExpanded && (
                <div className="from" style={{ marginTop: 12, width: "100%", lineHeight: 1.8 }}>
                  <div>
                    <strong>Payment ID:</strong> <span className="mono">{p.id}</span>
                  </div>
                  <div>
                    <strong>Status:</strong> {p.status}
                  </div>
                  <div>
                    <strong>Date:</strong> {new Date(p.created_at).toLocaleString()}
                  </div>
                  <div>
                    <strong>Payer address:</strong> <span className="mono">{p.payer_address}</span>
                  </div>
                  <div>
                    <strong>Amount:</strong> {formatAmount(Number(p.net_usdc), p.asset_code)}
                  </div>
                  {p.fee_status !== "none" && (
                    <div>
                      <strong>Fee status:</strong> {p.fee_status}
                      {p.fee_owed_raw && ` (${p.fee_owed_raw} ${p.fee_asset_code})`}
                    </div>
                  )}
                  {p.status === "held" && (
                    <div>
                      <strong>Hold reason:</strong> {HOLD_REASON_TEXT[p.flag_reason ?? ""] ?? HOLD_FALLBACK}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  return <ActivityContent />;
}
