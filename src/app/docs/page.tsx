// Static developer documentation page for technically-inclined merchants.
// Covers the link/payment/checkout data model and points toward the forthcoming
// merchant API-key flow once it exists. No auth required — read-only, public.

export default function DocsPage() {
  return (
    <div className="wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div className="header-row">
        <div className="brand">
          <span className="mark">✓</span> Konfirm
        </div>
      </div>

      <h1>Developer docs</h1>
      <p className="sub">
        Everything you need to understand what Konfirm does programmatically — the data model, the checkout flow, and
        how payment links map to on-chain transactions.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Overview</h2>
        <p>
          Konfirm is a Stellar-based payment confirmation layer. When a payer sends stablecoins (USDC by default) to
          your Stellar address, Konfirm watches the ledger and confirms the payment on-chain in real time — no polling,
          no webhooks to configure, no off-chain settlement risk.
        </p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Data model</h2>

        <h3 style={{ marginTop: "1.25rem" }}>Payment link</h3>
        <p>
          A payment link (<code>/links</code>) is a shareable URL that pre-fills a checkout with a fixed or open
          amount, a description, and your Stellar address. Each link has a unique <code>linkId</code> that routes the
          payer to <code>/pay/:linkId</code>.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Field</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Type</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["id", "UUID", "Unique link identifier"],
              ["description", "string | null", "Human-readable label shown to the payer"],
              ["amount_usdc", "decimal | null", "Fixed amount in USDC; null means open-amount"],
              ["asset_code", "string", "Asset expected (default: USDC)"],
              ["status", '"active" | "inactive"', "Whether the link accepts new payments"],
              ["created_at", "ISO 8601", "Creation timestamp (UTC)"],
            ].map(([field, type, desc]) => (
              <tr key={field as string} style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <code>{field}</code>
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-lo, #6b7280)" }}>{type}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: "1.5rem" }}>Payment</h3>
        <p>
          Each on-chain transaction that Konfirm matches to a payment link becomes a payment record. Payments are
          immutable once confirmed — status changes (holds, refunds, disputes) are tracked separately.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Field</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Type</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["id", "UUID", "Unique payment identifier"],
              ["net_usdc", "decimal", "Amount received after fees"],
              ["asset_code", "string", "Asset in which payment was made"],
              ["payer_address", "string", "Stellar address of the payer"],
              ["link_description", "string | null", "Description from the originating link"],
              ["status", '"paid" | "held" | "refunded" | "disputed"', "Current payment status"],
              ["fee_status", '"none" | "collected" | "owed" | "claimed" | "settled"', "Platform fee lifecycle"],
              ["fee_owed_raw", "decimal | null", "Platform fee amount if owed"],
              ["fee_asset_code", "string | null", "Asset in which the fee is owed"],
            ].map(([field, type, desc]) => (
              <tr key={field as string} style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <code>{field}</code>
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-lo, #6b7280)" }}>{type}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Checkout flow</h2>
        <ol style={{ lineHeight: 1.8 }}>
          <li>
            Merchant creates a payment link at <code>/new</code> (fixed or open amount, optional description).
          </li>
          <li>
            Merchant shares the link URL (<code>/pay/:linkId</code>) with a payer.
          </li>
          <li>Payer opens the link, sees the amount and description, and sends USDC to the displayed Stellar address.</li>
          <li>
            Konfirm watches the Stellar ledger in real time. When the transaction lands and matches the link, it is
            confirmed and appears in the merchant&apos;s <code>/activity</code> dashboard immediately.
          </li>
          <li>Merchant can cash out their balance at any time via <code>/cashout</code>.</li>
        </ol>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Referrals</h2>
        <p>
          Every merchant account includes a referral code, generated automatically at signup. Referred merchants are
          tracked under your account — see your <a href="/referrals">Referrals page</a> for your code, promo status,
          and the list of merchants you&apos;ve referred.
        </p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Merchant API (coming soon)</h2>
        <p>
          A programmatic merchant API — including API key management, webhook delivery, and direct link/payment
          endpoints — is under development. This documentation will be updated when the API-key flow ships. If you need
          early access or want to give input on the API design, contact{" "}
          <a href="mailto:support@konfirm.xyz">support@konfirm.xyz</a>.
        </p>
      </section>

      <section style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #e5e7eb)" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-lo, #6b7280)" }}>
          Questions? Email <a href="mailto:support@konfirm.xyz">support@konfirm.xyz</a>.
        </p>
      </section>
    </div>
  );
}
