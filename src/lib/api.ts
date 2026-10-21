import { useEffect } from "react";

// Every backend call goes through the same-origin proxy configured in
// next.config.ts — never a direct cross-origin call to the NestJS server.
export const API_BASE = "/api/backend";

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  // `data` is `T | null` because a 2xx response with an empty or non-JSON
  // body parses to `null` (see `apiFetch`). Callers must handle the null
  // case rather than assuming `data` is always present.
  data: T | null;
}

export interface ApiFailure {
  ok: false;
  status: number;
  message: string;
  body: unknown;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// Thin, typed wrapper around the hand-rolled `fetch(`${API_BASE}...`,
// {credentials:'include'})` + `res.json()` + `!res.ok` pattern that used to
// be independently reimplemented at every one of ~70 call sites across the
// app. `credentials: 'include'` is the default (matching the vast majority
// of real usage — session-bearing endpoints) and callers pass
// `credentials: 'omit'` for the few genuinely public endpoints (a public
// pay-link lookup, the testnet faucet). A JSON body is stringified and
// given the right content-type automatically; a non-JSON response body
// (none exist today, but `res.json()` throwing shouldn't crash the caller)
// degrades to `body: null` rather than throwing.
//
// NOTE: on a 2xx response, `data` is typed `T | null` — an empty or
// non-JSON body parses to `null` (via `.catch(() => null)`), so callers must
// not assume `data` is non-null. Treat a null `data` on a 2xx response as a
// failed/empty result (e.g. guard with `if (!result.data) ...`) before
// accessing nested fields; TypeScript will flag unchecked `.data.<field>`
// access on an `ApiResult`.
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const { body, headers, credentials, ...rest } = init;
  const isJsonBody = typeof body === "string" || (body !== undefined && !(body instanceof FormData));
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: credentials ?? "include",
    headers: isJsonBody
      ? (() => {
          const h = new Headers(headers as HeadersInit | undefined);
          if (!h.has("Content-Type")) h.set("Content-Type", "application/json");
          return h;
        })()
      : headers,
    body,
    ...rest,
  });
  const parsed = await res.json().catch(() => null);
  if (!res.ok) {
    const message = typeof (parsed as { message?: unknown } | null)?.message === "string"
      ? (parsed as { message: string }).message
      : `request failed (${res.status})`;
    return { ok: false, status: res.status, message, body: parsed };
  }
  return { ok: true, status: res.status, data: parsed as T };
}

export function apiPost<T = unknown>(path: string, json?: unknown, init: RequestInit = {}): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { ...init, method: "POST", body: json !== undefined ? JSON.stringify(json) : undefined });
}

export function apiPatch<T = unknown>(path: string, json?: unknown, init: RequestInit = {}): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { ...init, method: "PATCH", body: json !== undefined ? JSON.stringify(json) : undefined });
}

export function apiDelete<T = unknown>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { ...init, method: "DELETE" });
}

// Admin list endpoints (merchants, users, wallets, referrals, pay-links,
// x402-settlements, payments, notifications) accept `limit`/`offset` query
// params and default to `limit = 50` server-side. They may also return a
// total row count alongside the page of rows (either as `{ items, total }`
// or `{ data, total }`), which callers can use to show a "showing X of N"
// indicator and drive "load more"/pagination controls. `buildQuery` turns a
// params object into a query string, skipping undefined/null values so a
// caller can pass optional filters without conditionally building the path.
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// Convenience wrapper for GET requests with query params, e.g.
// `apiGet<Merchant[]>("/admin/merchants", { limit: 50, offset: 100 })`.
export function apiGet<T = unknown>(path: string, params: QueryParams = {}, init: RequestInit = {}): Promise<ApiResult<T>> {
  return apiFetch<T>(`${path}${buildQuery(params)}`, { ...init, method: "GET" });
}

// Extracts a total row count from a list response body, tolerating the
// common shapes admin endpoints use (`{ total }`, `{ count }`, or a bare
// array where no total is available). Returns `null` when the backend
// didn't report a total, so callers can fall back to "there may be more".
export function extractTotal(body: unknown): number | null {
  if (Array.isArray(body)) return null;
  if (body && typeof body === "object") {
    const record = body as { total?: unknown; count?: unknown };
    if (typeof record.total === "number") return record.total;
    if (typeof record.count === "number") return record.count;
  }
  return null;
}
