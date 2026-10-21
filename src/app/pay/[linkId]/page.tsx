"use client";

import { use, useEffect, useRef, useState } from "react";
import freighterApi from "@stellar/freighter-api";
import { TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import qrcode from "qrcode-generator";
import { API_BASE } from "@/lib/api";
import { formatAmount } from "@/lib/format";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

interface LinkData {
  merchant_name: string;
  description: string | null;
  amount_usdc: string;
  fee_usdc: string | null;
  currency: string;
  stellar_base_address: string;
}

interface ConfirmedPayment {
  tx_hash: string;
  muxed_id: string;
}

const STAGE = {
  CONNECT: "Connecting your wallet…",
  PREP: "Preparing your payment…",
  SIGN: "Approve the payment in your wallet…",
  SEND: "Sending your payment…",
  CONFIRM: "Konfirming…",
};

// Every status line here is written for the person paying, not for whoever's
// debugging this later — no "session," "reconciler," or "screening" ever
// reaches this screen. Technical detail still goes to the console.
function friendlyMessage(err: unknown): string {
  const msg = String((err as Error)?.message || err || "");
  const knownSafe = [
    "link is not active",
    "link has expired",
    "link not found",
    "this address is not permitted to pay",
    "pay-what-you-want links need an amount",
  ];
  if (knownSafe.some((s) => msg.toLowerCase().includes(s))) {
    return "This payment link isn't available right now. Please contact the merchant.";
  }
  if (msg.toLowerCase().includes("declined") || msg.toLowerCase().includes("rejected")) {
    return "You'll need to approve the payment in your wallet to continue.";
  }
  if (msg.toLowerCase().includes("freighter") || msg.toLowerCase().includes("wallet")) {
    return "We couldn't connect to your wallet. Make sure Freighter is installed and unlocked, then try again.";
  }
  return "Something didn't go through on our end. Please try again.";
}

function randomMuxedId(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // Keep it within the positive int64 range Soroban/Stellar expect.
  const high = BigInt(buf[0] & 0x7fffffff);
  const low = BigInt(buf[1]);
  return ((high << 32n) | low).toString();
}

// Decodes the backend-supplied XDR and cross-checks it against what this
// page already showed the payer. The prepare-tx endpoint is a different
// request from the one that produced the displayed amount/merchant, so
// without this check a compromised or buggy backend could swap the
// destination or amount and the payer would never know. Fails closed.
function verifyPreparedXdr(
  xdr: string,
  networkPassphrase: string,
  expected: { destination: string; amount: string },
): void {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(xdr, networkPassphrase || Networks.TESTNET);
  } catch (err) {
    console.error("[konfirm checkout] could not decode prepared XDR", err);
    throw new Error("We couldn't verify this payment before signing. Please try again.");
  }

  const ops = "operations" in tx ? tx.operations : [];
  const paymentOp = ops.find((op) => op.type === "payment");
  if (!paymentOp || paymentOp.type !== "payment") {
    throw new Error("We couldn't verify this payment before signing. Please try again.");
  }

  const opDestination = paymentOp.destination;
  const opAmount = paymentOp.amount;
  const expectedAmount = Number(expected.amount);
  const opAmountNum = Number(opAmount);

  const destinationMatches = opDestination === expected.destination;
  const amountMatches =
    Number.isFinite(expectedAmount) &&
    Number.isFinite(opAmountNum) &&
    Math.abs(opAmountNum - expectedAmount) < 1e-7;

  if (!destinationMatches || !amountMatches) {
    console.error("[konfirm checkout] prepared XDR does not match displayed details", {
      expected,
      opDestination,
      opAmount,
    });
    throw new Error("This payment doesn't match what we showed you. For your safety, we stopped before signing.");
  }
}

export default function CheckoutPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);

  const [loadingText, setLoadingText] = useState("Loading…");
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [showQr, setShowQr] = useState(true);
  const [qrSvg, setQrSvg] = useState("");
  const [qrUri, setQrUri] = useState("#");
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedPayment | null>(null);
  const [linkInactive, setLinkInactive] = useState(false);

  const alreadyConfirmed = useRef(false);
  const sharedMuxedId = useRef<string | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  // True only while a payment is being signed/submitted/confirmed, so the
  // beforeunload prompt never fires during passive polling or idle states.
  const operationInFlight = useRef(false);
  useBeforeUnload(operationInFlight);
  const connectInFlight = useRef(false);

  function setStatusMsg(msg: string, isError = false) {
    setStatus(msg);
    setStatusIsError(isError);
  }

  function showSuccess(payment: ConfirmedPayment) {
    if (alreadyConfirmed.current) return; // either path can win; only act on the first
    alreadyConfirmed.current = true;
    setConfirmed(payment);
    broadcastRef.current?.postMessage({ type: "confirmed" });
  }

  // Asks only about this payer's own session, so a checkout page never
  // sees anyone else's payments. A 404 (session not yet visible) just means
  // keep waiting.
  async function pollForConfirmation(
    pollLinkId: string,
    muxedId: string,
    attempts: number,
    intervalMs: number,
  ): Promise<ConfirmedPayment | null> {
    for (let i = 0; i < attempts; i++) {
      if (alreadyConfirmed.current || cancelledRef.current) return null;
      const res = await fetch(`${API_BASE}/links/${pollLinkId}/sessions/${muxedId}`);
      if (cancelledRef.current) return null;
      if (res.ok) {
        const body: { confirmed: boolean; payment: { tx_hash: string } | null } = await res.json();
        if (cancelledRef.current) return null;
        if (body.confirmed && body.payment) return { tx_hash: body.payment.tx_hash, muxed_id: muxedId };
      }
      // Don't burn the bounded attempt budget while the tab is hidden —
      // wait for the payer to actually be looking at the page again.
      if (typeof document !== "undefined" && document.hidden) {
        await new Promise<void>((resolve) => {
          const onVisible = () => {
            if (!document.hidden) {
              document.removeEventListener("visibilitychange", onVisible);
              resolve();
            }
          };
          document.addEventListener("visibilitychange", onVisible);
        });
        continue;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  // The one server round trip reserves the payer-chosen muxed_id against
  // this link. A collision is astronomically unlikely with a real random
  // 64-bit value, but the correct response was always "pick a new one and
  // retry" — this is that retry, actually wired up client-side.
  async function reserveSessionWithRetry(maxAttempts = 3): Promise<string> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateId = randomMuxedId();
      const res = await fetch(`${API_BASE}/links/${linkId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muxed_id: candidateId }),
      });
      if (res.ok) return candidateId;
      const body = await res.json().catch(() => ({}));
      lastError = new Error(body.message || "session reservation failed");
      if (res.status !== 409) throw lastError; // only retry on a genuine collision
    }
    throw lastError;
  }

  // Renders the SEP-7 `web+stellar:pay` request as a scannable QR code and
  // makes the same URI directly tappable — on a phone that already has a
  // Stellar wallet installed, tapping opens it without needing a camera at
  // all. Falls back to hiding this option if it can't be built, since
  // Freighter still works on its own.
  async function setupQrPayment(muxedId: string) {
    try {
      const res = await fetch(`${API_BASE}/payments/pay-uri?linkId=${linkId}&muxed_id=${muxedId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "could not build a payment request");
      const qr = qrcode(0, "M");
      qr.addData(body.uri);
      qr.make();
      if (cancelledRef.current) return;
      setQrSvg(qr.createSvgTag(5, 8));
      setQrUri(body.uri);
    } catch (err) {
      reportError(err, { tags: { flow: "checkout", stage: "qr-setup", linkId } });
      setShowQr(false);
    }
  }

  async function handleConnect() {
    if (connectInFlight.current) return;
    connectInFlight.current = true;
    setConnecting(true);
    operationInFlight.current = true;
    broadcastRef.current?.postMessage({ type: "paying" });
    try {
      setStatusMsg(STAGE.CONNECT);
      const { default: freighterApi } = await import("@stellar/freighter-api");
      const access = await freighterApi.requestAccess();
      if (access.error) throw new Error(access.error);
      const payerAddress = access.address;

      setStatusMsg(STAGE.PREP);
      // Reserved once for the whole checkout (see init below) so the QR
      // code and this button race toward the same session — whichever the
      // payer actually completes is the one that lands.
      const muxedId = sharedMuxedId.current!;

      const prepRes = await fetch(`${API_BASE}/payments/prepare-tx?linkId=${linkId}&muxed_id=${muxedId}&payer=${payerAddress}`);
      const prep = await prepRes.json();
      if (!prepRes.ok) throw new Error(prep.message || "could not prepare transaction");

      // Cross-check the prepared XDR against the amount/merchant this page
      // already displayed before handing it to the wallet. Fails closed.
      if (linkData) {
        verifyPreparedXdr(prep.xdr, prep.network_passphrase, {
          destination: linkData.stellar_base_address,
          amount: linkData.amount_usdc,
        });
      }

      setStatusMsg(STAGE.SIGN);
      const signed = await freighterApi.signTransaction(prep.xdr, {
        networkPassphrase: prep.network_passphrase,
        address: payerAddress,
      });
      if (signed.error) throw new Error(signed.error);

      setStatusMsg(STAGE.SEND);
      // Raw Horizon REST call rather than the SDK's Server class — kept
      // this way even after moving off the CDN import, since it's fewer
      // moving parts to be wrong about.
      const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `tx=${encodeURIComponent(signed.signedTxXdr)}`,
      });
      const submitResult = await submitRes.json();
      if (!submitRes.ok) {
        const codes = submitResult.extras?.result_codes;
        throw new Error(codes ? JSON.stringify(codes) : submitResult.title || "submission failed");
      }

      setStatusMsg(STAGE.CONFIRM);
      // Short, bounded wait — Horizon's submit call above only returns once
      // the transaction is already in a ledger, so this is just waiting on
      // our own reconciler to notice, typically a few seconds. The QR
      // path's own ambient watcher (started on page load) has no such
      // deadline, since there's no way to know when someone might finish
      // scanning.
      c

/* … truncated 5176 chars — edit only what you need near the top … */
