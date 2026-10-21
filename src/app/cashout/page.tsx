"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import { reportError } from "@/lib/reportError";
import { useBeforeUnload } from "@/lib/useBeforeUnload";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
type Currency = "XLM" | "USDC";
type View = "form" | "progress" | "success";

interface Merchant {
  stellar_base_address: string | null;
}

const STATUS_COPY: Record<string, [string, string]> = {
  incomplete: ["Waiting for you to finish the form…", "Complete the details in the popup window."],
  pending_user_transfer_start: ["Confirm the transfer in your wallet…", ""],
  pending_anchor: ["Your cash-out is processing…", "The partner is handling the transfer."],
  pending_external: ["Your cash-out is processing…", "The partner is handling the transfer."],
  pending_stellar: ["Sending your cash-out…", ""],
  pending_user: ["Action needed…", "Check the popup window for a next step."],
  on_hold: ["Your cash-out is on hold…", "The partner may need more information."],
};

function friendlyMessage(err: unknown): string {
  const msg = String((err as Error)?.message || err || "");
  if (msg.toLowerCase().includes("freighter") || msg.toLowerCase().includes("wallet")) {
    return "We couldn't connect to your wallet. Make sure Freighter is installed and unlocked, then try again.";
  }
  if (msg.toLowerCase().includes("declined") || msg.toLowerCase().includes("rejected")) {
    return "You'll need to approve the signature in your wallet to continue.";
  }
  return "Something didn't go through with the cash-out partner. Please try again.";
}

export default function CashoutPage() {
  const { data: merchant, resolved } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [view, setView] = useState<View>("form");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [hint, setHint] = useState("");
  const [starting, setStarting] = useState(false);

  const merchantAddress = useRef<string | null>(null);
  const cancelled = useRef(false);
  const paymentSubmitted = useRef(false);
  const signingInFlight = useRef(false);
  const inFlight = useRef(false);
  useBeforeUnload(signingInFlight);

  // Ref mutation (not React state) in response to an external value
  // arriving — the one part of the original effect that's genuinely
  // syncing with an outside system, not deriving UI. The "no address on
  // file" message below is computed at render time instead of via
  // setState in this effect, which would otherwise trigger an avoidable
  // cascading render.
  useEffect(() => {
    if (merchant?.stellar_base_address) {
      merchantAddress.current = merchant.stellar_base_address;
    }
  }, [merchant]);

  // Stop any in-flight polling when the component unmounts (e.g. the user
  // navigates away mid cash-out) so no further requests or state updates
  // happen after unmount.
  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);
  const missingAddressStatus =
    merchant && !merchant.stellar_base_address ? "Add a Stellar address to your account before cashing out." : "";

  function showProgress(s: string, h = "") {
    setView("progress");
    setStage(s);
    setHint(h);
  }

  function showFormError(msg: string) {
    inFlight.current = false;
    setView("form");
    setStatus(msg);
    setStarting(false);
  }

  async function sendWithdrawalPayment(token: string, id: string) {
    if (cancelled.current) return;
    showProgress("Preparing the transfer…");
    const prepRes = await fetch(`${API_BASE}/withdrawals/prepare-payment`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, token, id }),
    });
    if (cancelled.current) return;
    const prep = await prepRes.json();
    if (cancelled.current) return;
    if (!prepRes.ok) throw new Error(prep.message || "could not prepare the transfer");

    if (!merchantAddress.current) throw new Error("no Stellar address on file");
    showProgress("Approve the transfer in your wallet…");
    const { default: freighterApi } = await import("@stellar/freighter-api");
    const signed = await freighterApi.signTransaction(prep.xdr, {
      networkPassphrase: prep.network_passphrase,
      address: merchantAddress.current,
    });
    if (cancelled.current) return;
    if (signed.error) throw new Error(signed.error);

    showProgress("Sending your cash-out…");
    const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(signed.signedTxXdr)}`,
    });
    if (cancelled.current) return;
    const submitResult = await submitRes.json();
    if (cancelled.current) return;
    if (!submitRes.ok) {
      const codes = submitResult.extras?.result_codes;
      throw new Error(codes ? JSON.stringify(codes) : submitResult.title || "submission failed");
    }
  }

  async function pollStatus(token: string, id: string) {
    while (!cancelled.current) {
      const res = await fetch(`${API_BASE}/withdrawals/status?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`);
      if (cancelled.current) return;
      const txn = await res.json().catch(() => ({}));
      if (cancelled.current) return;
      if (!res.ok) {
        showFormError(friendlyMessage(new Error(txn.message)));
        return;
      }

      if (txn.status === "completed") {
        setView("success");
        return;
      }
      if (["error", "expired", "refunded"].includes(txn.status)) {
        showFormError("The cash-out partner could not complete this one. Please try again.");
        return;
      }

      if (txn.status === "pending_user_transfer_start" && !paymentSubmitted.current) {
        paymentSubmitted.current = true;
        try {
          await sendWithdrawalPayment(token, id);
          if (cancelled.current) return;
        } catch (err) {
          if (cancelled.current) return;
          console.error("[konfirm cashout] withdrawal payment failed", err);
          showFormError(friendlyMessage(err));
          return;
        }
      }

      if (cancelled.current) return;
      const copy = STATUS_COPY[txn.status] ?? ["Working on it…", ""];
      showProgress(copy[0], copy[1]);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async function handleStart() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStarting(true);
    paymentSubmitted.current = false;
    cancelled.current = false;
    try {
      setStatus("Connecting your wallet…");
      const { default: freighterApi } = await import("@stellar/freighter-api");
      const access = await freighterApi.requestAccess();
      if (cancelled.current) return;
      if (access.error) throw new Error(access.error);

      showProgress("Requesting a secure sign-in…");
      const challengeRes = await fetch(`${API_BASE}/withdrawals/challenge`, { credentials: "include" });
      if (cancelled.current) return;
      const challenge = await challengeRes.json();
      if (cancelled.current) return;
      if (!challengeRes.ok) throw new Error(challenge.message || "could not reach the cash-out partner");

      if (!merchantAddress.current) throw new Error("no Stellar address on file");
      showProgress("Approve the sign-in in your wallet…");
      const signedChallenge = await freighterApi.signTransaction(challenge.transaction, {
        networkPassphrase: challenge.network_passphrase,
        address: merchantAddress.current,
      });
      if (cancelled.current) return;
      if (signedChallenge.error) throw new Error(signedChallenge.error);

      const tokenRes = await fetch(`${API_BASE}/withdrawals/token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: signedChallenge.signedTxXdr }),
      });
      if (cancelled.current) return;
      const tokenBody = await tokenRes.json();
      if (cancelled.current) return;
      if (!tokenRes.ok) throw new Error(tokenBody.message || "the cash-out partner rejected that signature");

      showProgress("Opening the cash-out form…");
      const startRes = await fetch(`${API_BASE}/withdrawals/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, token: tokenBody.token }),
      });
      if (cancelled.current) return;
      const startBody = await startRes.json();
      if (cancelled.current) return;
      if (!startRes.ok) throw new Error(startBody.message || "could not start a cash-out");

      signingInFlight.current = false;
      inFlight.current = false;
      window.open(startBody.url, "konfirm-cashout", "width=460,height=700");
      pollStatus(tokenBody.token, startBody.id);
    } catch (err) {
      if (cancelled.current) return;
      console.error("[konfirm cashout]", err);
      showFormError(friendlyMessage(err));
    }
  }

  function handleAnother() {
    inFlight.current = false;
    setView("form");
    setStarting(false);
    setStatus("");
  }

  if (!resolved) return null;

  return (
    <div className="page-center">
      <div className="card">
        <div className="top">
          <div className="brand">
            <span className="mark">✓</span> Konfirm
          </div>
          <Link className="back" href="/activity">
            ← Activity
          </Link>
        </div>

        {view === "form" && (
          <div>
            <h1>Cash out</h1>
            <p className="sub">Move funds from your Stellar wallet to a bank account through a Stellar anchor partner.</p>

            <div className="currency-toggle">
              {(["XLM", "USDC"] as Currency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ctoggle${currency === c ? " active" : ""}`}
                  aria-pressed={currency === c}
                  onClick={() => setCurrency(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="limit-note">This test partner accepts between 1–10 units per cash-out.</div>

            <button
              type="button"
              className="primary"
              disabled={starting || Boolean(missingAddressStatus)}
              onClick={handleStart}
            >
              Connect wallet &amp; start cash-out
            </button>
            <div
              className={`status${status || missingAddressStatus ? " error" : ""}`}
              role="alert"
              aria-live={status || missingAddressStatus ? "assertive" : "polite"}
            >
              {status || missingAddressStatus}
            </div>
          </div>
        )}

        {view === "progress" && (
          <div className="progress">
            <div className="spin" />
            <div className="stage">{stage}</div>
            <div className="hint">{hint}</div>
          </div>
        )}

        {view === "success" && (
          <div className="success-box">
            <div className="tick">✓</div>
            <h1 className="success-title">Cash-out complete</h1>
            <div className="success-detail">Your funds are on their way to your bank.</div>
            <button type="button" className="secondary" onClick={handleAnother}>
              Start another cash-out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
