"use client";

import { useState } from "react";
import { getPublicKey, signTransaction } from "@stellar/freighter-api";

function friendlyMessage(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("not found")) return msg;
  if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel")) {
    return "the request was cancelled in your wallet";
  }
  if (lower.includes("freighter") || lower.includes("wallet")) {
    return "could not reach your Freighter wallet — is it installed and unlocked?";
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed")) {
    return "could not reach the test-funds partner — check your connection and try again";
  }
  return msg;
}

const FAUCET_UNAVAILABLE_MESSAGE =
  "test funds aren't available on this deployment";

export default function GetTestUsdcPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");

  async function handleGetTestUsdc() {
    setStatus("loading");
    setMessage("");

    try {
      const publicKey = await getPublicKey();
      if (!publicKey) {
        throw new Error("could not read your Freighter public key");
      }

      const challengeRes = await fetch("/api/deposits/testnet-faucet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey }),
      });

      if (challengeRes.status === 404) {
        throw new Error(FAUCET_UNAVAILABLE_MESSAGE);
      }

      if (!challengeRes.ok) {
        const challenge = await challengeRes.json().catch(() => ({}));
        throw new Error(
          challenge.message || "could not reach the test-funds partner",
        );
      }

      const challenge = await challengeRes.json();
      const signed = await signTransaction(challenge.transaction, {
        networkPassphrase: challenge.networkPassphrase,
      });

      const submitRes = await fetch("/api/deposits/testnet-faucet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTransaction: signed }),
      });

      if (submitRes.status === 404) {
        throw new Error(FAUCET_UNAVAILABLE_MESSAGE);
      }

      if (!submitRes.ok) {
        const submit = await submitRes.json().catch(() => ({}));
        throw new Error(
          submit.message || "could not reach the test-funds partner",
        );
      }

      setStatus("success");
      setMessage("test USDC sent to your wallet");
    } catch (err) {
      setStatus("error");
      const raw = err instanceof Error ? err.message : String(err);
      setMessage(
        raw === FAUCET_UNAVAILABLE_MESSAGE ? raw : friendlyMessage(raw),
      );
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Get test USDC</h1>
      <p className="text-sm text-gray-600">
        Connect your Freighter wallet to receive test USDC on the Stellar testnet.
      </p>

      <button
        type="button"
        onClick={handleGetTestUsdc}
        disabled={status === "loading"}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {status === "loading"
          ? "Requesting test USDC…"
          : "Connect Freighter & get test USDC"}
      </button>

      {status === "success" && (
        <p className="text-sm text-green-600">{message}</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">{message}</p>
      )}
    </main>
  );
}
