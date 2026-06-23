# 0062 — Onboarding: capture company name + business type up front

## Context
An onboarding review found two gaps that undercut the rest of the product:
1. The **company name** typed on the signup form was **silently dropped** — the
   register API schema didn't accept it, so the Organization was created lazily on
   the first data request and named after the person's name/email.
2. The **business type** (industry) — which drives the whole multi-industry metric
   engine + Navi-score benchmarks (decisions 0060/0061) — was only reachable in
   Settings, and its inferred suggestion needs transactions to already be synced.
   So a brand-new user got generic metrics and might never discover the tailoring.

## Decision (scope: fix + industry step)
1. **Name the org from the company field at signup.** `RegisterSchema` now accepts
   `company`; the register route creates the `Organization` immediately, named
   `company || name || email`. The form already sent `company` — it was only being
   discarded server-side.
2. **Add a "What kind of business is this?" step to the onboarding wizard**
   (`OnboardingFlow`), shown as step 1 before Connect. Picking an industry POSTs to
   `/api/org/industry` and advances to Connect. The step is **skipped** when the
   org already has an industry (mount check), and offers "Skip for now." So a new
   user's metrics and health score are industry-tailored from the first insight,
   not after a later trip to Settings.

## Why
- Both fixes make work already built actually surface at the moment of first
  impression (correct org name; industry-aware dashboard on day one).
- Low-risk: no schema change, non-blocking industry POST, generic/unset still
  works (Skip), and the settings picker remains the place to change it later.

## Not in scope (deferred — the "full redesign" option)
Account-type choice (owner vs. fractional CFO) branching to firm setup / client
invites, email verification, a post-connect next-steps checklist, and an explicit
plan-selection moment.

## Verify
tsc + eslint clean. Manual: sign up with a company name → org is named correctly;
new user sees the business-type step first, picks one → dashboard shows that
industry's pack + tuned score; a user who already set an industry skips the step.
