# konfirm-frontend

The customer- and merchant-facing pages for [Konfirm](https://github.com/konfirm-HQ/konfirm-backend), a non-custodial payment processor on Stellar.

Sibling repos: [konfirm-backend](https://github.com/konfirm-HQ/konfirm-backend) (the API this app calls, now a pure JSON API with no page-serving of its own) and [konfirm-contracts](https://github.com/konfirm-HQ/konfirm-contracts) (Soroban contracts, not yet in the live request path).

## Pages

| Route | File | Purpose |
|---|---|---|
| `/signup` | `src/app/signup/page.tsx` | Merchant account creation — business name, email, password, Stellar payout address |
| `/login` | `src/app/login/page.tsx` | Merchant login |
| `/new` | `src/app/new/page.tsx` | Create a payment link — amount, XLM/USDC toggle, description |
| `/pay/:linkId` | `src/app/pay/[linkId]/page.tsx` | Checkout — Freighter *or* a SEP-7 QR code / tappable link for any Stellar mobile wallet, whichever the payer finishes first |
| `/activity` | `src/app/activity/page.tsx` | Merchant dashboard — live payment feed, polls every 3s, per-asset totals |
| `/cashout` | `src/app/cashout/page.tsx` | Fiat off-ramp — real SEP-10/SEP-24 flow against Stellar's reference anchor |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | Requests a password-reset email. Gives the same reply whether or not the account exists |
| `/reset-password` | `src/app/reset-password/page.tsx` | Sets a new password from the emailed link. Reached only with a `?token=` |
| `/get-test-usdc` | `src/app/get-test-usdc/page.tsx` | Pulls test USDC from the reference anchor via Freighter, then forwards it to whatever wallet you're actually testing checkout with — not part of the merchant product. Needs the backend's `ENABLE_TESTNET_FAUCET=true`; off in production |
| `/referrals` | `src/app/referrals/page.tsx` | Merchant referral link, promo-rate status, and a table of referred merchants |

### Admin

A separate, admin-only section — a fully distinct identity from merchant auth (own login, own session cookie), not a page any merchant can reach. A sidebar shell (`src/app/admin/layout.tsx`) rather than the single-card/top-nav pattern everywhere else, since this section has more than one destination.

| Route | File | Purpose |
|---|---|---|
| `/admin/login` | `src/app/admin/login/page.tsx` | Admin login — a different form posting to a different backend auth system entirely |
| `/admin` | `src/app/admin/page.tsx` | Overview — stat cards (merchant counts, today's payments, blocked addresses, open cash-outs, reconciler staleness) and a 7-day volume chart, all backed by real `GET /admin/stats` aggregates, plus the recent-activity feed |
| `/admin/merchants` | `src/app/admin/merchants/page.tsx` | Merchant list, suspend/reactivate |
| `/admin/payments` | `src/app/admin/payments/page.tsx` | All payments across every merchant, filterable by status, with a paid/held/disputed control per row |
| `/admin/compliance` | `src/app/admin/compliance/page.tsx` | The address blocklist — block/unblock, with the SEP-7/QR coverage gap stated on the page itself, not just in a README |
| `/admin/reconciler` | `src/app/admin/reconciler/page.tsx` | Cursor status + a rewind form that mirrors the backend's own backward-only guard client-side, so a forward jump is caught before the request round-trips. A `window.confirm` pointing at `docs/RUNBOOK.md` gates every submit — this is a rare, deliberately manual operation, not a routine control, and the UI doesn't pretend otherwise |
| `/admin/withdrawals` | `src/app/admin/withdrawals/page.tsx` | Cash-out visibility only — a manual refresh re-polls the anchor for anything not yet finished; there's no admin action here beyond looking, because Konfirm has no authority over the anchor's own transaction state |
| `/admin/users` | `src/app/admin/users/page.tsx` | Every payer address with payment count and volume across all statuses |
| `/admin/wallets` | `src/app/admin/wallets/page.tsx` | Every address in the system with its roles (merchant, payer, blocked) |
| `/admin/pay-links` | `src/app/admin/pay-links/page.tsx` | Payment links across every merchant |
| `/admin/referrals` | `src/app/admin/referrals/page.tsx` | Referral attributions and reward status |
| `/admin/fee-revenue` | `src/app/admin/fee-revenue/page.tsx` | Fee revenue totals and daily series from confirmed payments |
| `/admin/exchange-rate` | `src/app/admin/exchange-rate/page.tsx` | Live XLM and EURC rates, and the rates applied to payments |
| `/admin/treasury` | `src/app/admin/treasury/page.tsx` | Treasury contract state (read-only) |
| `/admin/blockchain` | `src/app/admin/blockchain/page.tsx` | Deployed contract addresses and live status |
| `/admin/facilitator` | `src/app/admin/facilitator/page.tsx` | Facilitator spend against the daily cap, halt status, and resume |
| `/admin/x402-settlements` | `src/app/admin/x402-settlements/page.tsx` | x402 single-shot settlements |
| `/admin/bazaar` | `src/app/admin/bazaar/page.tsx` | Review x402 Bazaar submissions: approve or reject |
| `/admin/notifications` | `src/app/admin/notifications/page.tsx` | Events derived from existing rows: disputes, stuck withdrawals, blocks |

Every admin page is guarded by the shared `admin/layout.tsx` — the first nested layout in this app, since this is the first section where the auth-check-on-mount + nav pattern is genuinely shared across more than one page instead of duplicated inline like everywhere else today. The Overview chart is a small hand-rolled SVG area chart, not a charting library — this app has no charting dependency, and one 7-point series doesn't need one.

## Tech stack

- **Next.js 16** (App Router, Turbopack), **React 19**, TypeScript
- No CSS framework — a single hand-written token stylesheet (`src/app/globals.css`), consolidated from what used to be a per-page inline `<style>` block
- Real npm dependencies for everything that used to be loaded some other way: `@stellar/freighter-api` (was an `esm.sh` CDN import) and `qrcode-generator` (was a vendored static file) — same upstream libraries, now installed like any other dependency instead of trusted to a CDN or hand-copied into the repo

This is a rewrite of what was originally a plain-HTML `public/` directory served directly by `konfirm-backend`. That version is gone — this app is now the only place the frontend lives.

## Backend-for-frontend (BFF) proxy

The browser never talks to the NestJS API directly. `next.config.ts` rewrites everything under `/api/backend/*` to the real backend (`BACKEND_URL`, default `http://localhost:4001`), server-to-server, forwarding the full request — including the session cookie — and relaying the full response, including any `Set-Cookie`, untouched.

This keeps auth same-origin from the browser's point of view: no CORS, no `SameSite=None`, no HTTPS-in-dev requirement. `src/lib/api.ts` exports `API_BASE = "/api/backend"`, which every page's `fetch` calls use — nothing in a page component ever needs to know the backend's real address.

## Running it locally

```bash
npm install
BACKEND_URL=http://localhost:4001 npm run dev
```

Requires [konfirm-backend](https://github.com/konfirm-HQ/konfirm-backend) running separately (see that repo's README) and [Freighter](https://www.freighter.app/), set to Testnet, for exercising checkout, cash-out, or get-test-usdc yourself.

| Variable | Required | Notes |
|---|---|---|
| `BACKEND_URL` | No | Defaults to `http://localhost:4001`. Only read server-side by the rewrite — never exposed to the browser |

## Verifying the proxy

Confirmed for real, not just by reading the rewrite config: signed up through `/api/backend/auth/signup`, checked the session cookie was set on the Next.js origin, then hit `/api/backend/auth/me` and an auth-guarded endpoint (`/api/backend/withdrawals/challenge`) with that same cookie and got the expected authenticated response back — the full cookie round trip through the proxy, not assumed from the config alone.

## Design language

Dark by design, not by default — one shared token set (`--ink`, `--surface`, `--accent`, etc.) in `globals.css` rather than the old approach of repeating the same tokens inline on every page. Status copy is written for the person using it: no "session," "reconciler," or "screening" ever reaches a customer-facing screen, and raw errors are filtered through an allowlist (`friendlyMessage()` in each page that needs it) before they're shown — anything not explicitly recognized falls back to a generic message, with the real error going to the console instead.

## CI

`.github/workflows/ci.yml` — install, lint, `next build` (which runs its own full TypeScript check — a standalone `tsc --noEmit` step run first fails on a clean checkout, since App Router's generated route types don't exist until a build has run at least once), `npm audit --audit-level=high`. No database or backend dependency to stand up, since none of these checks make a real network call.

## Deployment

[Vercel](https://vercel.com) — its native Next.js build already matches what CI validates (`next build`), so no Dockerfile or platform-specific config is needed here, unlike `konfirm-backend`.

Set `BACKEND_URL` in the Vercel project's environment variables to the deployed backend's real public URL (see `konfirm-backend`'s README, Deployment section) — without it, the BFF proxy defaults to `http://localhost:4001` and every `/api/backend/*` call fails in production. See `.env.example` for the exact variable.

## Known limitations

- **Testnet only** — same as the backend; nothing here changes for mainnet beyond whatever `BACKEND_URL` points at in production.
- **No E2E browser tests yet.** Every page has been typechecked, linted, built, and curl-verified against the live backend through the proxy, but nothing here drives an actual browser — Freighter's signature prompt and the anchor's interactive popup are both real UI a script can't click through headlessly. Those stay manually tested, same limitation the backend's own README calls out for its test suite.

## License

[MIT](LICENSE)
