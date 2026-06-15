# 0041 — Review follow-ups: recharts splitting, withOwner, overlay a11y

- **Date:** 2026-06-15
- **Status:** accepted
- **Owner (DRI):** engineering

## Decision
Clear the three deferred items from the Fable-5 review.

### 1. Code-split recharts (`next/dynamic`)
recharts is a large dependency that was in the initial bundle of every page with
a chart. Every chart is now lazy-loaded with `ssr: false` and a shared
`ChartSkeleton` fallback, so recharts ships only when a chart actually renders.
- `components/charts/ChartSkeleton.tsx` — pure (no recharts) loading placeholder.
- Pages converting their static chart import to `dynamic(...)`: dashboard
  (CashFlowChart + NaviScore), cash-flow, expenses (ExpenseChart), pl
  (IncomeExpenseChart), forecast (ForecastChart).
- The model page used recharts inline; its chart is extracted to
  `components/model/ModelProjectionChart.tsx` and lazy-loaded the same way.
- `RevenueChart` / `PLChart` had no importers (dead) — left untouched.

### 2. `withOwner` wrapper + `planLabel` helper; route migration
- `lib/api/with-org.ts` gains **`withOwner`** — composes `withOrg`, then 403s
  anyone who isn't the org OWNER (shared 401 contract, `OwnerContext` includes
  `role: 'OWNER'`). Owner-only routes drop their hand-rolled
  `getOrgRole(...) !== 'OWNER'` guard: `org/portal` (GET/POST),
  `org/portal/[id]` (POST/DELETE), `org/members` (DELETE), `org/invites`
  (GET/POST), `org/invites/[id]` (DELETE).
- `lib/org.ts` gains **`planLabel`** (CFO stays an acronym; others title-cased),
  now used by the invites route's seat-limit message. (The client `TeamSection`
  keeps its own copy — importing `lib/org` into a client component would pull
  `prisma` into the browser bundle.)
- The four clean credits routes (`balance`, `checkout`, `confirm`, `dev-clear`)
  moved from the hand-rolled `requireAuth`/`getDefaultOrgId` + `try/catch → 401`
  to `withOrg`.
- Intentionally **not** migrated: routes with a single unified
  `try { …everything… } catch` that returns a domain-specific fallback (metrics,
  pl, insights/chat, alerts, integrations/*, revenue/movement, stripe/metrics).
  Wrapping them would swallow their fallback behavior — left as-is.

### 3. Overlay accessibility
New `hooks/useFocusTrap.ts`: moves focus into an overlay, traps Tab/Shift+Tab,
closes on Escape, and restores focus to the trigger on close.
- **ProvenanceDrawer** (modal drawer) — replaced its manual Escape/focus effect
  with `useFocusTrap` (full trap).
- **OrgSwitcher** (menu popover) — `useFocusTrap` on the open menu; added
  `role="menu"` + `aria-label`; kept click-away.
- **AdInsightPopover** (hover popover) — a hover popover is non-modal and
  auto-closes on mouse-leave, so a hard trap is the wrong pattern. Added
  Escape-to-close + focus return to the trigger instead.

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint src` — clean (whole tree).
- Behavior-preserving: owner routes still 403 non-owners (status unchanged, so
  `PortalSection`'s forbidden-detection still works); credits routes still 401.
- **Run `npm test` on the dev machine** (macOS) for the full jest suite — the
  Linux sandbox can't load the macOS SWC binaries in `node_modules`.
