"use client";

import { useCallback, useEffect, useState } from "react";
import freighterApi from "@stellar/freighter-api";
import { TransactionBuilder, Operation } from "@stellar/stellar-sdk";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";

// Merchant-side fee settlement (docs/design/qr-fee-collection.md, Option B).
// Shows what the merchant owes, then clears it in one transaction they sign in
// Freighter. The transaction moves money from the merchant's own account to the
// fee account, and Konfirm only submits what the merchant signed.

interface OwedTotal {
  asset_code: string;
  asset_issuer: string | null;
  amount: string;
  payments: number;
}

const RESULT_TEXT: Record<string, string> = {
  op_underfunded: "Your balance is too low to cover the owed fees. Add funds, then try again.",
  tx_insufficient_balance: "Your balance is too low to cover the owed fees. Add funds, then try again.",
  tx_bad_auth: "The signature didn't match this account. Check the account selected in Freighter.",
};

function describeFailure(body: { message?: unknown; result_codes?: unknown }): string {
  const codes = body.result_codes as { operations?: string[]; transaction?: string } | null;
  const first = codes?.operations?.find((c) => RESULT_TEXT[c]) ?? codes?.transaction;
  if (first && RESULT_TEXT[first]) return RESULT_TEXT[first];
  return typeof body.message === "string" ? body.message : "The settlement couldn't be completed. Please try again.";
}

// Decode the backend-supplied XDR and confirm every payment operation matches
// the owed totals already shown to the merchant. Fails closed on any mismatch
// so a compromised or buggy backend can't redirect the settlement.
function verifySettlementXdr(xdr: string, networkPassphrase: string, owed: OwedTotal[]): void {
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const ops = "operations" in tx ? tx.operations : [];
  const expected = new Map<string, number>();
  for (const t of owed) {
    const key = `${t.asset_code}:${t.asset_issuer ?? ""}`;
    expected.set(key, (expected.get(key) ?? 0) + Number(t.amount));
  }
  const seen = new Map<string, number>();
  for (const op of ops) {
    if (op.type !== "payment") {
      throw new Error("The fee payment contains an unexpected operation. Nothing was signed.");
    }
    const payment = op as Operation.Payment;
    const asset = payment.asset;
    const code = asset.isNative() ? "XLM" : asset.getCode();
    const issuer = asset.isNative() ? "" : asset.getIssuer();
    const key = `${code}:${issuer}`;
    seen.set(key, (seen.get(key) ?? 0) + Number(payment.amount));
  }
  if (seen.size !== expected.size) {
    throw new Error("The fee payment doesn't match the fees shown. Nothing was signed.");
  }
  for (const [key, amount] of expected) {
    const got = seen.get(key);
    if (got === undefined || Math.abs(got - amount) > 1e-7) {
      throw new Error("The fee payment doesn't match the fees shown. Nothing was signed.");
    }
  }
}

export default function FeeSettlement({ address }: { address: string }) {
  const [totals, setTotals] = useState<OwedTotal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  // Always-fresh reads: this is a balance check (fees owed), so a
  // cached/stale response could understate or overstate what's actually
  // owed right now.
  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/fees/owed`, { cache: "no-store" });
    if (res.ok) {
      const body: { totals: OwedTotal[] } = await res.json();
      setTotals(body.totals);
    }
  }, []);

  useEffect(() => {
    load().catch((err) => console.error("[konfirm fees] could not load owed fees", err));
  }, [load]);

  async function settle() {
    setBusy(true);
    setStatus(null);
    try {
      const created = await fetch(`${API_BASE}/fees/settlements`, { method: "POST" });
      const body = await created.json().catch(() => ({}));
      if (!created.ok) throw Object.assign(new Error(describeFailure(body)), { handled: true });

      try {
        verifySettlementXdr(body.unsigned_xdr, body.network_passphrase, totals ?? []);
      } catch (err) {
        throw Object.assign(
          new Error(err instanceof Error ? err.message : "The fee payment couldn't be verified. Nothing was signed."),
          { handled: true },
        );
      }

      setStatus({ text: "Approve the fee payment in your wallet…", error: false });
      const { default: freighterApi } = await import("@stellar/freighter-api");
      const signed = await freighterApi.signTransaction(body.unsigned_xdr, {
        networkPassphrase: body.network_passphrase,
        address,
      });
      if (signed.error) throw Object.assign(new Error("The wallet didn't sign the fee payment."), { handled: true });

      setStatus({ text: "Sending the fee payment…", error: false });
      const submitted = await fetch(`${API_BASE}/fees/settlements/${body.settlement_id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_xdr: signed.signedTxXdr }),
      });
      const result = await submitted.json().catch(() => ({}));
      if (!submitted.ok) throw Object.assign(new Error(describeFailure(result)), { handled: true });

      setStatus({ text: "Fees settled. Thank you.", error: false });
      await load().catch((refreshErr) => {
        console.warn("[konfirm fees] totals refresh failed after successful settlement", refreshErr);
      });
    } catch (err) {
      reportError(err, { tags: { area: "fee-settlement", action: "settle" } });
      setStatus({
        text: err instanceof Error && (err as Error & { handled?: boolean }).handled
          ? err.message
          : "Something went wrong settling fees. Please try again.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!totals || totals.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="merchant-label">Platform fees owed</div>
      <div className="sub" style={{ marginBottom: 8 }}>
        {totals.map((t) => (
          <div key={`${t.asset_code}:${t.asset_issuer ?? ""}`}>
            {t.amount} {t.asset_code} <small>across {t.payments} payment{t.payments === 1 ? "" : "s"}</small>
          </div>
        ))}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={settle}>
        Settle fees
      </button>
      {status && <div className={`status${status.error ? " error" : ""}`}>{status.text}</div>}
    </div>
  );
}
