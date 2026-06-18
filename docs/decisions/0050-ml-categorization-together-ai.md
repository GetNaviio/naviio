# 0050 — ML categorization via Together AI (DEFERRED — build when credits land)

- **Date:** 2026-06-17
- **Status:** proposed / deferred (blocked on Together AI accelerator credits)
- **Owner (DRI):** AI
- **Builds on:** 0049 (categorization at scale, phases 1–6)

## Why deferred
Phases 1–6 (data-driven rules + community map + recurrence + confidence + review
queue) are shipped and eliminate the large majority of mislabels with **no ML**.
The ML classifier (phase 7) only becomes worth its complexity once we've
accumulated enough labeled corrections to train on — which the community map is
now collecting. It also needs model-serving credits we don't yet have. So this is
written down to build the moment the Together AI Startup Accelerator credits land.

## The plan (phase 7)
Train a small classifier on the corrections the system already records, and use
it as one more layer in the existing resolver — **never** as a replacement for the
deterministic dollar math.

### Training data (already being collected)
- `TxnClassification` (per-org overrides) + `VendorCategoryStat` (cross-org,
  anonymized votes) are the labeled set: descriptor/merchant → confirmed category.
- Each review-queue confirmation adds a fresh label. No new collection needed —
  the loop from 0049 is the data pipeline.

### Features (no PII beyond merchant string)
Normalized descriptor tokens (`splitJammedTokens`), MCC / Plaid PFC, amount band,
direction (DEBIT/CREDIT), recurrence cadence (from `detectRecurring`), and
counterparty. All already computed in `lib/metrics/*`.

### Model + serving
- Start simple: logistic regression / gradient-boosted trees, or a small
  embedding + nearest-centroid over descriptors. Cheap, explainable, fast.
- Serve via the existing provider router (`lib/ai/complete.ts`) against Together
  AI (`TOGETHER_API_KEY`, `TOGETHER_MODEL`) for any LLM-assisted enrichment, or a
  hosted inference endpoint for the trained classifier. Keep it behind `hasLLM()`
  so the app degrades to phases 1–6 when no provider is configured.

### Where it plugs in (one new layer)
In `resolveTxnCategoryDetailed`, insert the model **below** user/vendor/community
and **above** the keyword fallback:
`user → vendor → community → ML(conf ≥ τ) → merchant registry → Plaid PFC → Other`.
The model only fires when its confidence clears a threshold τ; otherwise the
existing heuristics handle it. Output is still a label routed through the same
confidence/needsReview machinery.

### Guardrails (required before it ships)
- **Eval harness first.** A labeled regression set + an accuracy/▾misclassification
  dashboard. The model ships only if it beats the heuristics on held-out data, and
  is monitored continuously (track % low-confidence, % corrected, drift).
- **Math stays deterministic.** The model labels a category; it never produces a
  financial figure. Buckets that affect the P&L (transfer vs. expense vs. revenue)
  keep their deterministic guards (e.g. `beatsTransfer`).
- **Confidence-gated + reviewable.** Below τ → review queue, exactly as today.
- **Privacy.** Train only on the anonymized/merchant-level features above; no
  amounts tied to identity, consistent with 0049's community-map posture.

## Trigger to build
Together AI accelerator credits approved → stand up the eval harness, export the
accumulated labels, train v0, A/B against the heuristics behind τ, ship if it wins.

## Cost note
Categorization inference is high-volume; prefer the trained lightweight classifier
(cheap) over per-transaction LLM calls. Reserve LLM calls for genuinely ambiguous
descriptors the classifier flags low-confidence — not the whole ledger.
