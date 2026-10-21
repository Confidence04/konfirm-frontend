import type { Metadata } from "next";
import AdminShell from "./AdminShell";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";

interface Admin {
  name: string;
}

const NAV_GROUPS = [
  {
    label: "Platform",
    items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/merchants", label: "Merchants" },
      { href: "/admin/users", label: "Users" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/fee-revenue", label: "Fee Revenue" },
      { href: "/admin/fees-owed", label: "Fees Owed" },
      { href: "/admin/exchange-rate", label: "Exchange Rate" },
      { href: "/admin/pay-links", label: "Pay Links" },
      { href: "/admin/x402-settlements", label: "x402 Settlements" },
      { href: "/admin/withdrawals", label: "Withdrawals" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/admin/compliance", label: "Compliance" },
      { href: "/admin/reconciler", label: "Reconciler" },
      { href: "/admin/blockchain", label: "Blockchain" },
      { href: "/admin/wallets", label: "Wallets" },
      { href: "/admin/treasury", label: "Treasury" },
      { href: "/admin/facilitator", label: "Facilitator" },
      { href: "/admin/notifications", label: "Notifications" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/referrals", label: "Referrals" },
      { href: "/admin/bazaar", label: "Bazaar" },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // The login page itself never needs this check — running it there too
  // would just redirect straight back to itself.
  const { resolved, data: admin } = useRequireAuth<Admin>({
    meEndpoint: "/admin/auth/me",
    loginPath: "/admin/login",
    skip: isLoginPage,
    select: (body) => (body as { admin: Admin }).admin,
  });

  async function handleLogout() {
    await apiPost("/admin/auth/logout");
    router.push("/admin/login");
  }

  if (isLoginPage) return <>{children}</>;
  if (!resolved) return null;

  return (
    <div className={`admin-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <button
        type="button"
        className="admin-sidebar-toggle"
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <span aria-hidden="true">{sidebarOpen ? "✕" : "☰"}</span>
      </button>
      <aside className="admin-sidebar">
        <div className="brand">
          <span className="mark">✓</span> Konfirm Admin
        </div>
        <nav className="admin-sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="admin-sidebar-group">
              <div className="admin-sidebar-group-label">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? "active" : ""}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {admin && <div className="hint">{admin.name}</div>}
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
      {sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
