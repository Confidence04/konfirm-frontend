"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiPatch } from "@/lib/api";
import { formatUtcTimestamp } from "@/lib/format";

type ListingStatus = "pending" | "approved" | "rejected";

interface Listing {
  id: string;
  kind: "facilitator" | "resource";
  name: string | null;
  url: string;
  description: string;
  network: string;
  scheme: string;
  contact_email: string | null;
  status: ListingStatus;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_OPTIONS: ListingStatus[] = ["pending", "approved", "rejected"];

function formatDate(iso: string | null): string {
  return iso ? formatUtcTimestamp(iso) : "—";
}

export default function AdminBazaarPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState<"" | ListingStatus>(() => {
    if (typeof window === "undefined") return "pending";
    return (sessionStorage.getItem("admin-bazaar-filter") as "" | ListingStatus) ?? "pending";
  });
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(status: string) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const result = await apiFetch<Listing[]>(status ? `/admin/bazaar-listings?status=${status}` : "/admin/bazaar-listings");
    if (result.ok && result.data) {
      setListings(result.data);
    } else {
      setListings([]);
      setError(result.ok ? "Could not load listings — try again." : result.message || "Could not load listings — try again.");
    }
    setLoading(false);
  }

  useEffect(() => {
    sessionStorage.setItem("admin-bazaar-filter", filter);
    (async () => {
      await load(filter);
    })();
  }, [filter]);

  async function handleReview(listing: Listing, status: "approved" | "rejected") {
    if (status === "approved") {
      const confirmed = window.confirm(
        `Approve "${listing.name || listing.url}"? This publishes the listing to the public discovery manifest (/.well-known/x402-bazaar.json), making it visible to other agents.`
      );
      if (!confirmed) return;
    }
    setPendingId(listing.id);
    setError(null);
    try {
      const result = await apiPatch(`/admin/bazaar-listings/${listing.id}/status`, { status });
      if (!result.ok) {
        setError(result.message || `Could not ${status === "approved" ? "approve" : "reject"} listing — try again.`);
        return;
      }
      await load(filter);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <h1>Bazaar</h1>
      <p className="sub">
        Third-party x402 facilitator and resource-server listings submitted via <code>POST /bazaar/listings</code>. A
        listing only appears in the public discovery manifest (<code>/.well-known/x402-bazaar.json</code>) once
        approved here — nothing is listed automatically.
      </p>

      <div className="filter-pills">
        <button type="button" className={`filter-pill ${filter === "" ? "active" : ""}`} onClick={() => setFilter("")}>
          All
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} type="button" className={`filter-pill ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
            {s}
          </button>
        ))}
      </div>

      {error && <div className="empty">{error}</div>}

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="empty">Could not load listings — try again.</div>
        ) : listings.length === 0 ? (
          <div className="empty">No listings match this filter.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Name / URL</th>
                  <th>Description</th>
                  <th>Network</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Submitted (UTC)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id}>
                    <td>{l.kind}</td>
                    <td>
                      {l.name && <div style={{ color: "var(--text-hi)" }}>{l.name}</div>}
                      <div className="mono">{l.url}</div>
                    </td>
                    <td>{l.description}</td>
                    <td className="mono">
                      {l.network} / {l.scheme}
                    </td>
                    <td>{l.contact_email || "—"}</td>
                    <td>
                      <span className={`status-pill ${l.status}`}>{l.status}</span>
                    </td>
                    <td>{formatDate(l.created_at)}</td>
                    <td>
                      {l.status === "pending" && (
                        <div className="button-group">
                          <button type="button" disabled={pendingId === l.id} onClick={() => handleReview(l, "approved")}>
                            Approve
                          </button>
                          <button type="button" disabled={pendingId === l.id} onClick={() => handleReview(l, "rejected")}>
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}