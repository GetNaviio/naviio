/**
 * Ad-spend validation: reconcile a bank charge from Meta/Google against the
 * platform's own daily spend reports, then surface what that money bought.
 *
 * Why matching is non-trivial: ad platforms don't bill calendar months. Meta
 * bills when a spend THRESHOLD is hit (and at month end); Google bills on
 * thresholds or monthly. So one bank charge = "some contiguous run of days
 * whose platform-reported spend sums to the charge amount", ending shortly
 * before the charge posts. This module finds that window.
 *
 * Pure functions — no I/O — so the matcher is exhaustively unit-testable.
 */

export type AdPlatform = 'META_ADS' | 'GOOGLE_ADS'

export interface DailyInsight {
  accountId: string
  accountName?: string | null
  date: string // 'YYYY-MM-DD'
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue?: number | null
}

export interface KpiTotals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number | null
}

export interface MatchResult {
  /** true → window spend reconciles with the bank charge within tolerance */
  matched: boolean
  accountId: string | null
  accountName: string | null
  /** Inclusive day window the charge covers (or the fallback window) */
  from: string | null
  to: string | null
  days: number
  /** Platform-reported spend over the window */
  platformSpend: number
  /** bank charge − platform spend (0 on an exact match) */
  delta: number
  totals: KpiTotals
  /** 'billing-window' = reconciled; 'recent-30d' = honest fallback when no window sums to the charge */
  basis: 'billing-window' | 'recent-30d'
}

// ─── Platform detection from bank descriptors ────────────────────────────────
// Real-world strings: "FACEBK *2ABC34DE5", "META PLATFORMS INC", "FB ADS",
// "GOOGLE *ADS7644-1234", "GOOGLE ADS", "ADWORDS:84512", "GOOGLE*ADWS".
const META_RE = /\bfacebk\b|\bfb\.?\s*ads?\b|facebook\s*ads?|meta\s*platforms|\bmeta\s*ads?\b|instagram\s*ads?/i
const GOOGLE_RE = /google\s*\*?\s*ad|adwords|google\s*ads|google\*adws/i

export function detectAdPlatform(description?: string | null, merchantName?: string | null): AdPlatform | null {
  const text = `${description ?? ''} ${merchantName ?? ''}`
  if (META_RE.test(text)) return 'META_ADS'
  if (GOOGLE_RE.test(text)) return 'GOOGLE_ADS'
  return null
}

// ─── Date helpers ('YYYY-MM-DD', UTC, lexically ordered) ─────────────────────
export const dayOf = (d: Date | string): string =>
  (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const calendarDays = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000) + 1

// ─── Matching ────────────────────────────────────────────────────────────────

/** Charges post 0–4 days after the billing window closes. */
const MAX_POST_LAG_DAYS = 4
/** Longest plausible billing window (monthly invoicing + a few grace days). */
const MAX_WINDOW_DAYS = 36
/** A window reconciles when |charge − spend| ≤ max($1, 1% of charge). */
const tolerance = (amount: number) => Math.max(1, amount * 0.01)

const round2 = (n: number) => Math.round(n * 100) / 100

const emptyTotals = (): KpiTotals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: null })

function addRow(t: KpiTotals, r: DailyInsight): void {
  t.spend += r.spend
  t.impressions += r.impressions
  t.clicks += r.clicks
  t.conversions += r.conversions
  if (r.conversionValue != null) t.conversionValue = (t.conversionValue ?? 0) + r.conversionValue
}

/**
 * Find the contiguous run of days (per ad account) whose platform spend sums
 * to the charge amount, ending 0–4 days before the charge date. Falls back to
 * the trailing 30 days when nothing reconciles — labeled, never silent.
 */
export function matchCharge(
  chargeAmount: number,
  chargeDate: string, // 'YYYY-MM-DD'
  rows: DailyInsight[],
): MatchResult {
  const tol = tolerance(chargeAmount)

  // Group per account — summing across accounts would blend billing cycles.
  const byAccount = new Map<string, DailyInsight[]>()
  for (const r of rows) {
    const arr = byAccount.get(r.accountId)
    if (arr) arr.push(r)
    else byAccount.set(r.accountId, [r])
  }

  let best: MatchResult | null = null

  for (const [accountId, accountRows] of byAccount) {
    const byDate = new Map(accountRows.map((r) => [r.date, r]))
    const accountName = accountRows.find((r) => r.accountName)?.accountName ?? null

    // Try each plausible window end (charge day back through the lag window),
    // extending backwards day by day; accept the first sum within tolerance.
    for (let lag = 0; lag <= MAX_POST_LAG_DAYS; lag++) {
      const end = addDays(chargeDate, -lag)
      const totals = emptyTotals()
      // The REPORTED window snaps to days that actually had spend — a charge
      // posting days after the window closes must not stretch the window over
      // zero-spend days.
      let firstSpendDay: string | null = null
      let lastSpendDay: string | null = null
      for (let span = 0; span < MAX_WINDOW_DAYS; span++) {
        const day = addDays(end, -span)
        const row = byDate.get(day)
        if (row) {
          addRow(totals, row)
          firstSpendDay = day // walking backwards → earliest so far
          lastSpendDay = lastSpendDay ?? day
        }
        if (totals.spend <= 0) continue
        const delta = chargeAmount - totals.spend
        if (Math.abs(delta) <= tol) {
          const candidate: MatchResult = {
            matched: true,
            accountId,
            accountName,
            from: firstSpendDay,
            to: lastSpendDay,
            days: firstSpendDay && lastSpendDay ? calendarDays(firstSpendDay, lastSpendDay) : 0,
            platformSpend: round2(totals.spend),
            delta: round2(delta),
            totals: { ...totals, spend: round2(totals.spend) },
            basis: 'billing-window',
          }
          // Prefer the tightest reconciliation across accounts/lags.
          if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) best = candidate
          break // extending further only overshoots
        }
        if (totals.spend > chargeAmount + tol) break // overshot — longer windows only grow
      }
    }
  }

  if (best) return best

  // Honest fallback: no window reconciles (missing days, multi-charge overlap,
  // currency/fee noise). Report trailing-30-day performance, clearly labeled.
  const to = chargeDate
  const from = addDays(chargeDate, -29)
  const totals = emptyTotals()
  let accountId: string | null = null
  let accountName: string | null = null
  for (const r of rows) {
    if (r.date >= from && r.date <= to) {
      addRow(totals, r)
      accountId = accountId ?? r.accountId
      accountName = accountName ?? r.accountName ?? null
    }
  }
  return {
    matched: false,
    accountId,
    accountName,
    from: totals.spend > 0 ? from : null,
    to: totals.spend > 0 ? to : null,
    days: totals.spend > 0 ? 30 : 0,
    platformSpend: round2(totals.spend),
    delta: round2(chargeAmount - totals.spend),
    totals: { ...totals, spend: round2(totals.spend) },
    basis: 'recent-30d',
  }
}

// ─── KPI derivation ──────────────────────────────────────────────────────────

export interface DerivedKpis {
  ctr: number | null // clicks / impressions
  cpc: number | null // spend / clicks
  cpm: number | null // spend / 1000 impressions
  cpa: number | null // spend / conversions
  roas: number | null // conversionValue / spend
}

export function deriveKpis(t: KpiTotals): DerivedKpis {
  return {
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
    cpc: t.clicks > 0 ? t.spend / t.clicks : null,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    cpa: t.conversions > 0 ? t.spend / t.conversions : null,
    roas: t.conversionValue != null && t.spend > 0 ? t.conversionValue / t.spend : null,
  }
}
