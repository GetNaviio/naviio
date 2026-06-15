# The Trust Layer — Naviio's differentiator thesis

> 2026-06-11. Why SMB owners will rely on Naviio when they've learned to
> distrust every other dashboard.

## The insight

Every FP&A tool shows numbers. None of them tell the user **whether to believe
them**. The moment QuickBooks says one thing, the bank says another, and the
dashboard says a third — or "June revenue" silently means "June through the
last sync" — the owner stops trusting the tool and goes back to a spreadsheet
they built themselves, because at least they know where its numbers came from.

The breakthrough is not another chart. It is making every number **defensible**:

1. **Fresh-stamped** — the user always sees how current the data is, bounded
   by the *stalest* source, never the average.
2. **Complete-or-labeled** — a partial month is never silently graded as a
   full one.
3. **Consistent everywhere** — the same transaction classifies identically in
   every view; one user tag moves it everywhere at once.
4. **Traceable** (next) — click any figure, see the transactions behind it.

A tool that holds those four properties doesn't compete with dashboards. It
competes with the owner's own spreadsheet — and wins, because it has the same
trustworthiness with none of the manual labor.

## Shipped (this pass)

| Property | Implementation |
|---|---|
| Fresh-stamped | `/api/model/monthly` returns per-source `lastSyncedAt` + `generatedAt`; `FreshnessLine` renders "Actuals from Bank + Stripe · synced 2h ago" on the Budget and TTM tabs, bounded by the **oldest** source and turning amber past 48h ("data may be out of date") |
| Complete-or-labeled | Current month flagged `currentMonthIsPartial`; monthly B/A/V grid labels it "(MTD)" and refuses to print a variance verdict for it; YTD variance covers **closed months only** (subtitle says so explicitly) — a full-month budget is never graded against partial actuals |
| Consistent everywhere | `classificationOverrides()` in the ledger service; user COGS/OpEx tags now apply in `/api/model`, `/api/model/monthly` (Budget + TTM actuals) — one definition, every consumer. Ledger rows carry `externalId` so the override key exists at every call site |

## Staged (the rest of the trust layer)

1. **Tag-from-the-tool** — the override read-path is now wired everywhere; the
   write-path UI (click a transaction on the Expenses page → tag COGS/OpEx)
   makes it user-facing. Small: one PATCH endpoint + row action.
2. **Provenance drill-down** — click any figure in P&L/Budget/TTM → drawer
   listing the underlying transactions with source badges. The single highest-
   trust feature a financial tool can ship; the data model already supports it
   (every figure is a pure function of ledger rows).
3. **Reconciliation tile** — trailing-month bank inflows vs Stripe net revenue
   with the delta and the payout-matching explanation. Surfaces double-count
   risk before the user finds it; turns the `isStripePayout` heuristic from a
   silent assumption into a visible, checkable claim.
4. **Month-close ritual** — "close May" marks the month locked; later syncs
   that change a closed month raise an alert instead of silently rewriting
   history. (Owners forgive missing data; they never forgive numbers that
   change behind their back.)
5. **Forecast accuracy ledger** — store each month's forecast at close; show
   forecast-vs-actual error over time. A tool that publishes its own track
   record earns the kind of trust no marketing can buy.

## The one-sentence positioning

*Naviio is the financial tool whose numbers you can defend — to your
co-founder, your board, and your accountant — because it shows you where every
figure came from, how fresh it is, and never grades an unfinished month.*
