# 0043 — Mobile bottom tab bar (customizable) + center Navi button

- **Date:** 2026-06-16
- **Status:** accepted
- **Owner (DRI):** product

## Decision
On mobile, replace reliance on the slide-in sidebar drawer with a native-style
**bottom tab bar** (the drawer/hamburger stays for the full menu + org switch +
logout). The bar is **user-customizable** with a prominent **center Navi button**.

Layout: `[ Overview · slot · (Navi) · slot · More ]`
- **Overview** is pinned (always position 1).
- **Two slots** are user-pickable from any page; the choice persists per-device.
- **Center Navi** button opens the AI co-pilot (the signature action).
- **More** opens a sheet with every off-bar page + the "Customize tabs" editor.

## Changes
- `hooks/useTabPrefs.ts` — persists the two chosen tab ids in `localStorage`
  (survives across sessions; SSR-safe read in an effect).
- `components/layout/MobileTabBar.tsx` (`lg:hidden`) — the bar, the center Navi
  button (dispatches `naviio:open-navi`), a More bottom-sheet (grid of remaining
  pages), and a Customize sheet (tap to add/remove up to 2, FIFO replace when
  full, reset-to-default). Default slots: Cash flow + P&L.
- `components/ChatBot.tsx` — listens for `naviio:open-navi` to open; its
  floating FAB is now `hidden lg:flex` so it doesn't overlap the bar on mobile
  (the center button is the mobile entry point; the FAB returns on desktop and
  when the panel is open for the close affordance).
- `components/layout/DashboardShell.tsx` — renders `<MobileTabBar />` and pads
  the main column `pb-16 lg:pb-0` so content never sits under the bar.

## Why this shape
User picked "user-customizable" + "center Navi button" from the options. A
center action button is the app-like signature; pinning Overview and keeping
More fixed makes the bar predictable while still letting users tailor the two
middle slots. localStorage (not the DB) keeps v1 simple; a per-user DB-synced
preference can come later if cross-device sync is wanted.

## Verification
- `npx tsc --noEmit` and `npx eslint` on changed files — clean.
- Desktop nav (sidebar) unchanged; bar is `lg:hidden`. Org switch + logout
  remain reachable via the existing hamburger drawer and More → Settings.

## Follow-ups (not done here)
- Drag-to-reorder the two slots (v1 uses tap order).
- Optional DB-synced tab preference for cross-device consistency.
