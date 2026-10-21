"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.message === "string" ? body.message : "Could not log in. Please try again.");
      }
      router.push("/admin");
    } catch (err) {
      reportError("admin-login", err);
      setStatus(err instanceof Error ? err.message : "Could not log in. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card narrow">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm Admin
        </div>
        <h1 style={{ marginBottom: 22 }}>Admin log in</h1>
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
          <div className={`status${status ? " error" : ""}`}>{status}</div>
        </form>
      </div>
    </div>
  );
}
