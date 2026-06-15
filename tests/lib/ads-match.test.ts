/**
 * Ad-spend matcher — the engine that tells an owner "this bank charge IS this
 * Meta/Google billing window." Pins: descriptor detection, threshold-billing
 * window reconstruction, post-lag handling, tolerance bounds, multi-account
 * separation, and the labeled 30-day fallback (never a silent wrong answer).
 */
import { detectAdPlatform, matchCharge, deriveKpis, addDays, type DailyInsight } from '@/lib/ads/match'

const day = (n: number) => addDays('2026-05-01', n) // 2026-05-01 + n

const row = (date: string, spend: number, extra: Partial<DailyInsight> = {}): DailyInsight => ({
  accountId: 'act_1',
  accountName: 'Main',
  date,
  spend,
  impressions: 1000,
  clicks: 50,
  conversions: 5,
  conversionValue: 250,
  ...extra,
})

describe('detectAdPlatform', () => {
  it.each([
    ['FACEBK *2ABC34DE5', 'META_ADS'],
    ['META PLATFORMS INC', 'META_ADS'],
    ['Facebook Ads', 'META_ADS'],
    ['INSTAGRAM ADS', 'META_ADS'],
    ['GOOGLE *ADS7644-1234', 'GOOGLE_ADS'],
    ['GOOGLE ADS', 'GOOGLE_ADS'],
    ['ADWORDS:84512', 'GOOGLE_ADS'],
  ])('detects %s → %s', (text, expected) => {
    expect(detectAdPlatform(text)).toBe(expected)
  })

  it('does not fire on ordinary merchants (metal, metabase, googol…)', () => {
    expect(detectAdPlatform('METAL SUPPLY CO')).toBeNull()
    expect(detectAdPlatform('Metabase Cloud')).toBeNull()
    expect(detectAdPlatform('AWS')).toBeNull()
  })

  it('reads the merchant name too', () => {
    expect(detectAdPlatform('payment', 'Meta Platforms')).toBe('META_ADS')
  })
})

describe('matchCharge', () => {
  it('reconciles an exact threshold window ending the day before the charge', () => {
    // 5 days × $50 = $250 charge posting the next day.
    const rows = [0, 1, 2, 3, 4].map((n) => row(day(n), 50))
    const m = matchCharge(250, day(5), rows)
    expect(m.matched).toBe(true)
    expect(m.basis).toBe('billing-window')
    expect(m.from).toBe(day(0))
    expect(m.to).toBe(day(4))
    expect(m.platformSpend).toBe(250)
    expect(m.delta).toBe(0)
    expect(m.totals.clicks).toBe(250) // 5 days × 50
  })

  it('handles posting lag of several days after the window closes', () => {
    const rows = [0, 1, 2].map((n) => row(day(n), 100))
    const m = matchCharge(300, day(6), rows) // window ends day 2, posts day 6 (lag 4)
    expect(m.matched).toBe(true)
    expect(m.to).toBe(day(2))
  })

  it('accepts sub-tolerance noise (fees/rounding) and reports the delta', () => {
    const rows = [0, 1].map((n) => row(day(n), 100))
    const m = matchCharge(201.5, day(2), rows) // $1.50 off on $201.50 → within 1%
    expect(m.matched).toBe(true)
    expect(m.delta).toBeCloseTo(1.5)
  })

  it('keeps ad accounts separate — never blends billing cycles', () => {
    const rows = [
      ...[0, 1].map((n) => row(day(n), 100, { accountId: 'act_A', accountName: 'Brand' })),
      ...[0, 1].map((n) => row(day(n), 40, { accountId: 'act_B', accountName: 'Local' })),
    ]
    const m = matchCharge(80, day(2), rows) // only act_B's 2×$40 fits
    expect(m.matched).toBe(true)
    expect(m.accountId).toBe('act_B')
    expect(m.platformSpend).toBe(80)
  })

  it('falls back to a LABELED 30-day view when nothing reconciles', () => {
    const rows = [0, 1, 2].map((n) => row(day(n), 33))
    const m = matchCharge(500, day(3), rows) // no window sums to 500
    expect(m.matched).toBe(false)
    expect(m.basis).toBe('recent-30d')
    expect(m.platformSpend).toBe(99)
    expect(m.delta).toBeCloseTo(401)
  })

  it('returns an empty fallback when there is no platform data at all', () => {
    const m = matchCharge(500, day(3), [])
    expect(m.matched).toBe(false)
    expect(m.days).toBe(0)
    expect(m.platformSpend).toBe(0)
  })
})

describe('deriveKpis', () => {
  it('derives the standard set', () => {
    const k = deriveKpis({ spend: 250, impressions: 5000, clicks: 250, conversions: 50, conversionValue: 1250 })
    expect(k.ctr).toBeCloseTo(5)
    expect(k.cpc).toBeCloseTo(1)
    expect(k.cpm).toBeCloseTo(50)
    expect(k.cpa).toBeCloseTo(5)
    expect(k.roas).toBeCloseTo(5)
  })

  it('never divides by zero', () => {
    const k = deriveKpis({ spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: null })
    expect(k).toEqual({ ctr: null, cpc: null, cpm: null, cpa: null, roas: null })
  })
})
