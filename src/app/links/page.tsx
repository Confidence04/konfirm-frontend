'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface PaymentLink {
  id: string;
  url: string;
  amount: number;
  description: string | null;
  active: boolean;
  createdAt: string;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function LinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/links', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load links (${res.status})`);
      }
      const data = await res.json();
      const items: PaymentLink[] = Array.isArray(data) ? data : data.links ?? [];
      setLinks(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const handleCopy = useCallback(async (link: PaymentLink) => {
    setCopyErrorId(null);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link.url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link.url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) {
          throw new Error('Copy command failed');
        }
      }
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === link.id ? null : current));
      }, 2000);
    } catch {
      setCopyErrorId(link.id);
    }
  }, []);

  const handleDeactivate = useCallback(
    async (link: PaymentLink) => {
      if (!window.confirm('Deactivate this payment link? It will no longer be payable.')) {
        return;
      }
      setDeactivatingId(link.id);
      setError(null);
      try {
        const res = await fetch(`/api/links/${encodeURIComponent(link.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ active: false }),
        });
        if (!res.ok) {
          throw new Error(`Failed to deactivate link (${res.status})`);
        }
        setLinks((current) =>
          current.map((item) => (item.id === link.id ? { ...item, active: false } : item)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to deactivate link');
      } finally {
        setDeactivatingId(null);
      }
    },
    [],
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My payment links</h1>
        <Link
          href="/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          New payment link
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading links…</p>
      ) : links.length === 0 ? (
        <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          You haven&apos;t created any payment links yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => (
            <li
              key={link.id}
              className="rounded-md border border-gray-200 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-medium">{formatAmount(link.amount)}</p>
                  {link.description && (
                    <p className="text-sm text-gray-600">{link.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    Created {formatDate(link.createdAt)}
                    {!link.active && (
                      <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-gray-700">
                        Inactive
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(link)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                  >
                    {copiedId === link.id ? 'Copied!' : 'Copy link'}
                  </button>
                  {link.active && (
                    <button
                      type="button"
                      onClick={() => void handleDeactivate(link)}
                      disabled={deactivatingId === link.id}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deactivatingId === link.id ? 'Deactivating…' : 'Deactivate'}
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-gray-700">{link.url}</p>
              {copyErrorId === link.id && (
                <p className="mt-1 text-xs text-red-600">
                  Couldn&apos;t copy automatically. Select the URL above and copy it manually.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}