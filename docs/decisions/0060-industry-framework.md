# 0060 — Industry framework (Phase 2): business type, detection, de-SaaS score

## Context
Naviio now targets any industry, not just startups. A controller review
recommended a **hybrid**: a universal metric core that always shows, plus an
industry-detected library that adds the metrics that matter for each business and
hides the ones that don't. The Navi score was hard-wired to SaaS (Growth ← MRR
growth, Retention ← NRR, Unit Economics ← LTV/CAC, Efficiency ← Magic Number), so
four of six dimensions silently null out for a restaurant/agency/trades business
and the score over-weighted the two that survived.

## Decision (Phase 2 — foundation)
1. **Business type on the org.** New `Organization.industry` (nullable; NULL =
   'generic'). One of: saas, ecommerce, restaurant, agency, trades, healthcare,
   generic. Set explicitly by the owner; **inferred** from the transaction mix as
   a pre-filled suggestion (`inferIndustry` over merchant/description signals +
   a strong SaaS prior when recurring revenue exists). Confidence-gated — we
   suggest only when the evidence is strong, else ask.
2. **Settings selector + onboarding suggestion** (`BusinessTypeSection`) — picks
   the type, shows the inferred suggestion with a one-click "Use this." `POST
   /api/org/industry` persists it and busts the org cache so metrics recompute.
3. **Navi score is now universal + industry-gated.** Dimensions:
   - Always (every industry): **Profitability** (net margin), **Growth**
     (month-over-month *revenue* growth, not MRR), **Gross Margin** (universal
     unit economics, shown when a COGS split exists), **Liquidity** (months of
     cash).
   - SaaS-only: **Retention** (NRR) and **Efficiency** (Magic Number) appear only
     when the business is SaaS (explicit, or implicit when MRR snapshots exist and
     no other industry is chosen). A restaurant no longer sees empty NRR/Magic
     axes; the score grades only the dimensions that fit.
   - New score bands: `scoreRevenueGrowth` (gentler than the SaaS pace) and
     `scoreGrossMargin`.
4. **`industry` + `industrySuggestion` exposed on `/api/metrics`** so any surface
   can gate on business type.

## Why
- Gross margin (Phase 1) + revenue growth are universal, so the score works for
  every business out of the box; SaaS metrics become an *additive* pack, not the
  baseline.
- Detection-then-confirm avoids both a forced onboarding wall and a silent wrong
  guess.

## Migration
`20260622030000_org_industry` adds the nullable column (idempotent). Raw SQL is
used to read/write `industry` until `prisma generate` picks up the column on the
build host (the sandbox can't fetch the engine).

## Tests
`tests/lib/industry.test.ts` — inference (restaurant, trades, SaaS prior, generic
no-signal), `isRecurringRevenue`, label fallback. Verified via ts-node.

## Next (Phase 2b / 3, not in this change)
Per-industry metric *packs* (restaurant prime cost / food-labor %, e-comm AOV /
repeat rate / contribution margin, agency utilization / effective rate, trades job
margin), a full metric registry that renders only satisfiable metrics per page,
per-industry score benchmark bands, and standardizing `USER_CATEGORIES` into a
fixed chart-of-accounts grouping.
