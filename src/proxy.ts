import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renamed the `middleware` file convention to `proxy` — same
// mechanics, different file/export name (confirmed against this version's
// own bundled docs, not assumed from older training data).
//
// A cheap, edge-level presence check only — not a real auth verification.
// The actual check still happens exactly as before: each protected page's
// useRequireAuth hook calls the real /auth/me or /admin/auth/me endpoint
// and redirects on failure. This only spares an unauthenticated visitor
// the round trip of downloading the client bundle, mounting the page, and
// running that effect before redirecting — the flash of protected UI and
// wasted JS execution that happened on every protected page load without
// this. A present-but-expired-or-invalid cookie still passes this check
// and gets redirected by the real client-side check instead, same
// end result as before this file existed.
const ADMIN_COOKIE = "konfirm_admin_session";
const MERCHANT_COOKIE = "konfirm_session";
const MERCHANT_PROTECTED_PATHS = ["/new", "/activity", "/cashout", "/referrals"];
const MERCHANT_PROTECTED_PATH_SET = new Set(MERCHANT_PROTECTED_PATHS);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!request.cookies.has(ADMIN_COOKIE)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  if (MERCHANT_PROTECTED_PATH_SET.has(pathname) && !request.cookies.has(MERCHANT_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", ...MERCHANT_PROTECTED_PATHS],
};
