"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already-authenticated visitors shouldn't see the login form — bounce
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
        // Ignore — just means we stay on the login page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "Could not log in. Please try again.");
      }
      router.push("/activity");
    } catch (err) {
      reportError("login", err);
      setStatus(err instanceof Error ? err.message : "Could not log in. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card narrow">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1 style={{ marginBottom: 22 }}>Log in</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="primary" disabled={submitting}>
            Log in
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
          <Link href="/forgot-password">Forgot your password?</Link>
          <br />
          New here? <Link href="/signup">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
