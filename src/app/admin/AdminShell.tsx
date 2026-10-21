"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";

const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/activity", label: "Activity" },
    ],
  },
  {
    label: "Payments",
    items: [
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/fee-revenue", label: "Fee Revenue" },
      { href: "/admin/fees-owed", label: "Fees Owed" },
      { href: "/admin/links", label: "Payment Links" },
      { href: "/admin/cashouts", label: "Cashouts" },
    ],
  },
  {
    label: "Wallets",
    items: [
      { href: "/admin/wallets", label: "Wallets" },
      { href: "/admin/transactions", label: "Transactions" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/team", label: "Team" },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/admin/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <Link href="/admin" className="text-lg font-semibold">
            Konfirm Admin
          </Link>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </p>
              <ul className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-2 py-1.5 text-sm ${
                          active
                            ? "bg-gray-100 font-medium text-gray-900"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-200 px-4 py-4">
          <p className="truncate px-2 text-sm text-gray-700">{user.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50 p-8">{children}</main>
    </div>
  );
}