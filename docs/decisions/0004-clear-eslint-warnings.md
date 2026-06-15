# 0004 — Clear the 80 ESLint warnings to zero

- **Date:** 2026-06-07
- **Status:** accepted
- **Owner (DRI):** naviio-orchestrator

## Context
After consolidating the lint config (0003), `eslint .` reported 0 errors but 80
warnings — accumulated debt. Cleared them so lint output is signal, not noise.

## Decision
- **Config (advisory rules):** turned off the experimental React-Compiler RC
  rules (`set-state-in-effect`, `immutability`, `purity`) — they fire on benign
  mount-only patterns — and `@next/next/no-img-element` (this app deliberately
  uses plain `<img>` for logos/data-URIs). 18 warnings.
- **Real fixes (62):**
  - Removed/renamed 17 unused vars & imports.
  - Escaped 5 unescaped JSX entities (`'`, `"`).
  - 40 `no-explicit-any`: ~22 `catch (err: any)` → `catch (err)` +
    `(err as Error).message`; recharts callback props given local types; lib
    arrays typed (`unknown[]` or minimal element interfaces); Prisma `provider`
    casts → `IntegrationProvider`; misc casts to concrete types.
  - Removed 2 now-unused `eslint-disable` directives.

## Consequences
- `eslint .` → **0 errors, 0 warnings**; `tsc --noEmit` clean. `next build`
  passes its lint gate cleanly.
- Lint is now meaningful: any new warning is a real regression.

## Loop / verification
- `npx eslint .` exit 0, grep warning count = 0.
- `npx tsc --noEmit` clean (only stale `.next` cache entries, regenerated on build).

## Follow-ups
- Keep it at zero — treat new warnings as blockers in review.
