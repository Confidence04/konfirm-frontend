"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) throw new Error("Too many requests. Please wait a minute and try again.");
      // Shown whether or not an account exists, so the form can't be used to
      // check which emails are registered.
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      setSent(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card narrow">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1 style={{ marginBottom: 22 }}>Reset your password</h1>
        {sent ? (
          <p className="sub">
            If an account exists for that email, we&apos;ve sent a link to choose a new password. It expires in 30 minutes.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
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
            <button type="submit" className="primary" disabled={submitting}>
              Send reset link
            </button>
            <div
              className={`status${status ? " error" : ""}`}
              role="alert"
              aria-live={status ? "assertive" : "polite"}
            >
              {status}
            </div>
          </form>
        )}
        <div className="footer">
          <Link href="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
