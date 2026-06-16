# 0042 — Make the static Header controls functional

- **Date:** 2026-06-15
- **Status:** accepted
- **Owner (DRI):** product

## Decision
The global Header had three cosmetic controls (Search, Notifications, Refresh)
that looked interactive but did nothing. All three are now wired up.

## Changes
- **Search → command palette** (`components/layout/CommandPalette.tsx`). Opens via
  the Search button or **Cmd/Ctrl+K**. Filters a nav list (every page + the
  Settings sub-tabs) and live-searches transactions by description/merchant using
  the existing `/api/transactions` (fetched once per open, filtered client-side —
  no new endpoint). Keyboard: ↑/↓ to move, Enter to open, Esc to close; uses
  `useFocusTrap` for focus management.
- **Notifications bell** (`components/layout/NotificationsBell.tsx`). Replaces the
  fake red dot. Reads `/api/alerts`, shows a real unread count, a dropdown of
  recent alerts, mark-one / mark-all read (`PATCH`), and a link to `/alerts`.
  Closes on click-away or Esc.
- **Refresh button** → real data refresh. The button broadcasts a
  `naviio:refresh` CustomEvent and calls `router.refresh()`. A new
  `RefreshBoundary` (`components/layout/RefreshBoundary.tsx`) wrapped around the
  dashboard `{children}` bumps a React key on the event, remounting the active
  page so it re-runs its data fetches.

## Why a remount boundary instead of per-page wiring
Only 2 of 12 dashboard pages use the shared `usePageData` hook; the rest
hand-roll their fetching. A single keyed-remount boundary in the layout refreshes
**every** page with one small change, rather than editing ten pages. The trade-off
is that a manual refresh resets transient page UI state (selected month, expanded
rows) — acceptable for an explicit "refresh data" action.

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint` on all changed/new files — clean.
- Integration-catalog search was already functional and left as-is.
