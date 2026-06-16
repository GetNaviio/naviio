# 0044 — Mobile-first redesign: auth + dashboard

- **Date:** 2026-06-16
- **Status:** accepted
- **Owner (DRI):** product

## Decision
The mobile experience was the desktop layout shrunk down — a form floating in a
void, hairline inputs, a long single column of generic cards. Redesign it
mobile-first (responsive in the same pages, so desktop is untouched), guided by:
thumb-zone actions, oversized numbers, 44px+ targets, flat navy with one
blue/teal accent, minimal chrome.

## Changes
- **Auth (`login` + `register`)** — bottom-anchored, branded layout on mobile:
  a brand hero in the top third, the form pushed into the thumb zone, large
  rounded **16px** inputs (kills iOS focus-zoom) with a focus ring, a gradient
  primary CTA, and `lg:` overrides that restore the original compact desktop
  styling. Login keeps its desktop split-screen exactly as before.
- **`SocialAuth`** — Google/passkey buttons and the email inputs scale up on
  mobile (`py-3.5 rounded-xl text-base`), back to compact on `lg:`.
- **Dashboard** — mobile gets a curated feed (`lg:hidden`): a **hero balance**
  card (2rem number), the remaining metrics as compact **2-up KPI chips**, and a
  tappable **Ask Navi** prompt (dispatches `naviio:open-navi`). The desktop
  4-column `MetricCard` grid is unchanged (`hidden lg:grid`); the chart, P&L
  snapshot, and runway gauge below are shared.

## Why responsive (not separate mobile components)
One codebase serves both; desktop stays pixel-identical via `lg:` overrides, and
there's no second layout to keep in sync. The split-component approach was
considered and rejected as higher maintenance.

## Verification
- `npx tsc --noEmit` and `npx eslint` on all changed files — clean.
- Desktop unaffected (all new treatment is default/mobile with `lg:` resets, or
  gated `lg:hidden` / `hidden lg:*`).

## Follow-ups
- Apply the same mobile feed pattern to P&L, Cash Flow, Expenses.
- Pull-to-refresh and swipeable KPI chips (native affordances) as enhancements.
