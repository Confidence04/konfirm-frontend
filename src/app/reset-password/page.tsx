"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setStatus("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.message === "string" && res.status === 400
            ? body.message
            : "Could not reset your password. Please try again.",
        );
      }
      router.push("/login");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not reset your password. Please try again.");
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="sub">
        This reset link is incomplete. <Link href="/forgot-password">Request a new one</Link>.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <button type="submit" className="primary" disabled={submitting}>
        Set new password
      </button>
      <div
        className={`status${status ? " error" : ""}`}
        role="alert"
        aria-live={status ? "assertive" : "polite"}
      >
        {status}
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="page-center">
      <div className="card narrow">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1 style={{ marginBottom: 22 }}>Choose a new password</h1>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <div className="footer">
          <Link href="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
