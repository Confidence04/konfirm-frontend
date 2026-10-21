"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useRequireAuth } from "@/lib/useAuth";

const RECENT_LINK_KEY = "konfirm:recentLink";
const DRAFT_KEY = "konfirm:newPaymentDraft";

const COPY_FEEDBACK_MS = 4000;

type Currency = "XLM" | "USDC" | "EURC";

const CURRENCY_SYMBOLS: Record<Currency, string> = { XLM: "", USDC: "$", EURC: "€" };

// Accepts pasted real-world price text — currency symbols/whitespace,
// US grouping ("$1,234.56") and EU grouping ("1.234,56" or "1 234,56") —
// and returns the numeric value, or null if it still isn't a valid number.
// Previously a plain `Number(...)` call rejected any of this with the same
// generic "enter an amount" error as truly empty input.
function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[^0-9.,\s-]/g, "").trim();
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator appears last is the decimal point.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Only commas: decimal comma (EU) if exactly one with 1-2 digits after
    // it, otherwise thousands separators.
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot > -1) {
    const parts = s.split(".");
    if (parts.length > 2) {
      // Multiple dots: thousands separators (EU style, e.g. "1.234.567").
      s = s.replace(/\./g, "");
    }
    // Single dot: already a valid decimal point, leave as-is.
  }

  s = s.replace(/\s/g, "");
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

interface Merchant {
  name: string;
}

export default function NewPaymentPage() {
  const router = useRouter();
  const { data: merchant, resolved } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [copyAnnouncement, setCopyAnnouncement] = useState("");
  const [showResult, setShowResult] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amountRaw = amount.trim();
    setStatus("");

    if (!amountRaw) {
      setStatus("Enter an amount greater than 0.");
      return;
    }

    const amountNum = parseAmount(amountRaw);
    if (amountNum === null) {
      setStatus("Enter a valid amount, like 1234.56.");
      return;
    }
    if (amountNum <= 0) {
      setStatus("Enter an amount greater than 0.");
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await apiPost<{ id: string }>("/links", {
        amount_usdc: amountNum.toFixed(2),
        currency,
        description: description.trim() || undefined,
      });
      if (!result.ok) {
        if (result.status === 401) {
          router.push("/login");
          return;
        }
        const bodyMessage = (result.body as { message?: unknown } | null)?.message;
        throw new Error(typeof bodyMessage === "string" ? bodyMessage : "Could not create that payment link.");
      }

      const url = `${window.location.origin}/pay/${result.data.id}`;
      setLinkUrl(url);
      setShowResult(true);
      try {
        window.localStorage.setItem(RECENT_LINK_KEY, url);
      } catch {
        // localStorage may be unavailable (private mode, quota); the link is still shown.
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // sessionStorage unavailable — ignore
      }
    } catch (err) {
      reportError(err, { tags: { area: "new-payment", action: "create-link" } });
      setStatus(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!navigator.clipboard?.writeText) {
      setStatus("Couldn't copy — select and copy the link manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(linkUrl);
      setStatus("");
      setCopyLabel("Copied");
      setCopyAnnouncement("Link copied to clipboard.");
      setTimeout(() => {
        setCopyLabel("Copy");
        setCopyAnnouncement("");
      }, COPY_FEEDBACK_MS);
    } catch (err) {
      console.error("[konfirm new-payment] clipboard", err);
      setStatus("Couldn't copy — select and copy the link manually.");
    }
  }

  function handleAnother() {
    setAmount("");
    setDescription("");
    setShowResult(false);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // sessionStorage unavailable — ignore
    }
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
          <Link className="back" href="/links">
            My links
          </Link>
        </div>

        {!showResult ? (
          <form onSubmit={handleSubmit}>
            <h1>Request a payment</h1>
            <p className="sub">
              {merchant?.name ? `Create a link you can send anyone — from ${merchant.name}.` : "Create a link you can send anyone."}
            </p>

            <div className="amount-row">
              <span className={`dollar${currency === "XLM" ? " hidden" : ""}`}>{CURRENCY_SYMBOLS[currency]}</span>
              <input
                className="amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="currency-toggle">
              {(["XLM", "USDC", "EURC"] as Currency[]).map((c) => (
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

            <div className="field">
              <label htmlFor="desc">What&apos;s it for?</label>
              <input
                id="desc"
                type="text"
                placeholder="e.g. A gift for Mom"
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="chips">
                {["Gift", "Payment", "Service"].map((fill) => (
                  <button key={fill} type="button" className="chip" onClick={() => setDescription(fill)}>
                    {fill}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="primary" disabled={submitting}>
              Create payment link
            </button>
            <div className={`status${status ? " error" : ""}`}>{status}</div>
          </form>
        ) : (
          <div className="success-box">
            <div className="tick">✓</div>
            <h1 className="success-title">Ready to send</h1>
            <div className="success-detail">Share this link, or open it yourself to test it now.</div>
            <div className="link-box">
              <span>{linkUrl}</span>
              <button type="button" onClick={handleCopy}>
                {copyLabel}
              </button>
            </div>
            <div role="status" aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
              {copyAnnouncement}
            </div>
            <div className={`status${status ? " error" : ""}`}>{status}</div>
            <button type="button" className="primary" onClick={() => window.location.assign(linkUrl)}>
              Open checkout
            </button>
            <button type="button" className="secondary" onClick={handleAnother}>
              Request another payment
            </button>
            <Link className="secondary" href="/links">
              View my payment links
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
