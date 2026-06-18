# Spec — Peer Benchmarks ("businesses like you pay…")

*The cheapest piece of the data moat. Builds on the existing cross-org community
map. No card, no license, no money movement. June 2026.*

## Goal
Tell a customer how their spend compares to similar businesses, two ways:
1. **Vendor pricing** — "For Acme SaaS you pay $90/mo; similar businesses pay a median of $55/mo (you're 1.6×)."
2. **Category spend** — "You spend 14% of revenue on Software; similar businesses spend 8%."

This is the seed of the same data advantage Ramp built: it gets better with every customer and can't be copied by anyone who doesn't have the data.

## Hard rule: privacy first
Spend data across customers is sensitive. Non-negotiables:
- **Aggregates only.** The benchmark tables store distributions, never a row tied to an org or amount-by-org.
- **k-anonymity.** A benchmark is shown only when **≥ 5 distinct orgs** are in that cohort. Below the threshold → no number.
- **Coarse cohorts.** Segment by broad size bands (and later industry), never anything that narrows to one company.
- **Robust stats.** Show median / p25 / p75, not mean or exact values (less leaky, more useful).
- **Opt-out** honored (same posture as the community map).

## Cohorts (segments)
Start simple — one dimension:
- **Size band** from annual revenue (or headcount if available): `<$250k`, `$250k–1M`, `$1–5M`, `$5–20M`, `$20M+`.
- A benchmark key = `segment = sizeBand` (Phase 1). Later add `industry` → `sizeBand|industry`.

## Data model (new tables — aggregates only)
```
VendorSpendStat
  vendorKey   String   // normalized merchant (reuse classify.vendorKey)
  segment     String   // size band
  bucket      Int      // log-scale monthly-$ bucket index
  orgs        Int      // distinct orgs in this bucket
  updatedAt   DateTime
  @@unique([vendorKey, segment, bucket])

CategorySpendStat
  category    String   // a USER_CATEGORIES label
  segment     String
  bucket      Int      // bucket of (category spend ÷ revenue), e.g. percent bands
  orgs        Int
  updatedAt   DateTime
  @@unique([category, segment, bucket])
```
Histograms (bucketed counts) let us estimate median/p25/p75 without ever storing a raw per-org amount. Buckets are coarse (e.g. log-spaced for $, 1–2% bands for ratios).

## How it's populated (nightly cron, recompute-clean)
A `/api/cron/benchmarks` job (add to vercel.json):
1. For each org: compute its typical **monthly spend per vendor** (reuse `detectRecurring` / monthly averages) and its **category spend ÷ revenue** (reuse `incomeStatement`).
2. Drop each value into the right `(vendorKey|category, segment, bucket)`.
3. **Recompute the tables wholesale each run** (truncate-and-rebuild, or upsert with a run-id swap) so it's idempotent and an org is never double-counted. No per-org contribution rows are kept — the aggregate is the only persisted artifact.

At early scale a full recompute is cheap; note incremental aggregation as a later optimization.

## Read API
`lib/benchmarks/read.ts`:
- `getVendorBenchmark(vendorKey, segment) → { median, p25, p75, orgs } | null` (null if `orgs < 5`).
- `getCategoryBenchmark(category, segment) → { medianPct, p25, p75, orgs } | null`.
Percentiles estimated from the histogram. Cached per segment.

Endpoint `GET /api/benchmarks?segment=…` returns the current org's vendors/categories joined to their benchmarks (only those that clear k-anon), with the org's own value + the peer median + a ratio.

## Where it shows up (UI)
- **Expenses tab — "vs peers" chip** on recurring vendor rows: `$90/mo · 1.6× peer median` (amber when notably above). One small, high-signal element.
- **A "Benchmarks" insight card** (Overview or Expenses): top 3 "you may be overpaying" vendors + the 1–2 categories where you're highest vs peers. Each links to the transactions.
- Everything degrades gracefully: if a cohort is too small, show "Not enough peers yet" — never a fake number.

## Navi agent integration (reuse what's built)
Add one **read tool** `peer_benchmark` to `lib/navi/tools.ts`:
- input: `{ vendorOrCategory }`; returns the org's value + peer median + ratio (k-anon gated).
- Now Navi can answer "Am I overpaying for X?" / "How does my software spend compare?" — and it can pair with `create_scenario` / proposed actions ("want me to flag this for renegotiation?").

## Phasing (build order)
- **Phase 1 (MVP, ~the cheap win):** `VendorSpendStat` + nightly cron + read API + the "vs peers" chip on recurring expenses + the `peer_benchmark` Navi tool. Size-band segment only. k-anon = 5.
- **Phase 2:** `CategorySpendStat` (spend-as-%-of-revenue) + the Benchmarks insight card.
- **Phase 3:** add `industry` to the segment; incremental aggregation; "trend" (are peers' prices rising?).

## Risks / watch-outs
- **Re-identification.** Enforce k-anon and coarse bands rigorously; never expose a cohort that could be one company. Unit-test the gate.
- **Cold start.** Benchmarks are empty until enough orgs exist per cohort — that's expected; show the empty state honestly and let it fill in. (Same discipline as the community map's `MIN_VOTES`.)
- **Garbage in.** Bad categorization → bad benchmarks. The benchmark quality rides on the categorizer you already hardened, plus the review queue.
- **Consent/transparency.** Make the "anonymized, aggregated, opt-out" stance visible; it's both the right thing and a trust selling point.

## Why this first
It's the one moat-building feature that needs **no new license, no compliance, no risk, and no card** — just the data you already collect. It makes the product visibly smarter today, and it's the asset that makes a future card 10× more valuable.
