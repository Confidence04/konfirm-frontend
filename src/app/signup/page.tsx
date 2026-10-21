"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Already-authenticated visitors shouldn't see the signup form — bounce
  // them straight to the app instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (!cancelled && res.ok) {
          router.replace("/activity");
        }
      } catch {
        // Ignore — just means we stay on the signup page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  // Present only when someone arrived via another merchant's referral
  // link (see /referrals) — an invalid/expired code is rejected silently
  // server-side, not surfaced as an error here, since it should never
  // block signing up.
  const referralCode = searchParams.get("ref");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const addressTrimmed = address.trim();
    if (!/^G[A-Z2-7]{55}$/.test(addressTrimmed)) {
      setStatus("Enter a valid Stellar G... address.");
      return;
    }
    setSubmitting(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          stellar_base_address: addressTrimmed,
          ...(referralCode ? { referral_code: referralCode } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof body.message === "string" ? body.message : "Check your details — something in that form was not right.";
        throw new Error(msg);
      }
      router.push("/activity");
    } catch (err) {
      reportError("signup", err);
      setStatus(err instanceof Error ? err.message : "Could not create your account. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1 style={{ marginBottom: 22 }}>Create your account</h1>
        {referralCode && (
          <div className="status" style={{ marginBottom: 16, background: "var(--surface)", padding: "10px 14px", borderRadius: 8 }}>
            You were referred by another merchant — this is credited automatically, nothing else to do.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Business name</label>
            <input
              id="name"
              type="text"
              autoComplete="organization"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="hint">At least 8 characters.</div>
          </div>
          <div className="field">
            <label htmlFor="address">Your Stellar payout address</label>
            <input
              id="address"
              type="text"
              placeholder="G..."
              autoComplete="off"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <div className="hint">This is where your payments land — Konfirm never holds your funds.</div>
          </div>
          <button type="submit" className="primary" disabled={submitting}>
            Create account
          </button>
          <div
            className={`status${status ? " error" : ""}`}
            role="alert"
            aria-live={status ? "assertive" : "polite"}
          >
            {status}
          </div>
        </form>
        <div className="footer">
          Already have an account? <Link href="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary in the app router — same
// pattern already used in src/app/activity/page.tsx for the same reason.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
