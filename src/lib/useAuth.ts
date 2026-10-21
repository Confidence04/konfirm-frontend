"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "./api";

export interface UseRequireAuthOptions<T> {
  /** e.g. "/admin/auth/me" or "/auth/me" */
  meEndpoint: string;
  /** e.g. "/admin/login" or "/login" */
  loginPath: string;
  /** Skip the check entirely — e.g. the login page itself. */
  skip?: boolean;
  /** Pull the caller's shape out of the /me response body, e.g.
   * `(body) => body.admin` or `(body) => body.merchant`. Defaults to the
   * raw body. */
  select?: (body: unknown) => T;
}

export interface UseRequireAuthResult<T> {
  /** True once the check has resolved successfully (or was skipped) — the
   * same "don't render the real page yet" gate every duplicated
   * implementation had under a different local variable name. */
  resolved: boolean;
  data: T | null;
}

// Consolidates the identical auth-check block that was independently
// hand-rolled in four places (admin/layout.tsx, new/page.tsx,
// activity/page.tsx, cashout/page.tsx): fetch a `/*/auth/me`-style
// endpoint with credentials, redirect to a login page on failure, and hold
// off rendering the real page until it resolves. This only covers that one
// shared shape — pages with extra derived state (activity/page.tsx's
// showNav, cashout/page.tsx's stellar-address check) still compute that
// themselves from `data`, same as before.
export function useRequireAuth<T = unknown>(options: UseRequireAuthOptions<T>): UseRequireAuthResult<T> {
  const router = useRouter();
  const { meEndpoint, loginPath, skip, select } = options;
  const [resolved, setResolved] = useState(Boolean(skip));
  const [data, setData] = useState<T | null>(null);
  const prevSkipRef = useRef(Boolean(skip));

  useEffect(() => {
    // Reset resolved when skip transitions from true to false so the auth
    // gate blocks rendering until the re-check actually completes (#124).
    if (prevSkipRef.current && !skip) {
      setResolved(false);
      setData(null);
    }
    prevSkipRef.current = Boolean(skip);
    if (skip) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}${meEndpoint}`, { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) {
          router.push(loginPath);
          return;
        }
        // Guard against a 200 with an empty/non-JSON body: an unguarded
        // res.json() would throw and leave `resolved` false forever.
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (body === null) {
          router.push(loginPath);
          return;
        }
        setData(select ? select(body) : (body as T));
        setResolved(true);
      } catch {
        // Any other unexpected failure (network error, select() throwing)
        // must still reach a terminal state rather than hanging the gate.
        if (cancelled) return;
        router.push(loginPath);
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, meEndpoint, loginPath]);

  return { resolved, data };
}

// Single shared timestamp formatter for admin pages. The backend stores
// timestamps in UTC, so every admin-visible timestamp is pinned to UTC
// explicitly (rather than implicitly using the viewer's browser-local zone)
// and labelled with a visible "UTC" suffix so it's unambiguous without
// relying on the viewer's own clock. Returns "—" for missing values.
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString(undefined, { timeZone: "UTC" })} UTC`;
}
