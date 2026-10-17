"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE, apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import FeeSettlement from "@/components/fee-settlement";

interface Payment {
  id: string;
  net_usdc: string;
  asset_code: string;
  payer_address: string;
  link_description: string | null;
  status: "paid" | "held" | "refunded" | "disputed";
  flag_reason: string | null;
  fee_status: "none" | "collected" | "owed" | "claimed" | "settled";
  fee_owed_raw: string | null;
  fee_asset_code: string | null;
}

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

function formatAmount(amount: number, code: string): string {
  return code === "USDC" ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${code}`;
}

// The dashboard is only ever the logged-in merchant's own data. There's no
// address-in-the-URL view any more: the backend returns payments by session,
// so an unauthenticated visitor sees nothing.
function ActivityContent() {
  const router = useRouter();
  const { resolved, data: merchant } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
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

  return (
    <div className="wrap">
      <div className="header-row">
        <div className="brand">
          <span className="mark">✓</span> Konfirm
        </div>
        {showNav && (
          <div className="nav">
            <Link href="/new">+ New payment</Link>
            <Link href="/cashout">Cash out</Link>
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
            $0.00 <small>received</small>
          </>
        )}
      </div>
      <div>
        {resolved && !hasAddress && <div className="empty">No Stellar address on file yet.</div>}
        {hasAddress && payments.length === 0 && !pending && (
          <div className="empty">No payments yet — this updates the instant one lands.</div>
        )}
        {payments.map((p) => (
          <div className="payment" key={p.id}>
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
        ))}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  return <ActivityContent />;
}
