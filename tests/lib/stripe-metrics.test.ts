import { subscriptionMrr, logoChurnRate } from '@/lib/integrations/stripe'
import type Stripe from 'stripe'

type Item = { price: { unit_amount: number | null; recurring: { interval: string; interval_count?: number } | null }; quantity?: number }
const sub = (items: Item[], over: Record<string, unknown> = {}): Stripe.Subscription =>
  ({ status: 'active', items: { data: items }, ...over } as unknown as Stripe.Subscription)

const monthly = (cents: number): Item => ({ price: { unit_amount: cents, recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 })
const annual = (cents: number): Item => ({ price: { unit_amount: cents, recurring: { interval: 'year', interval_count: 1 } }, quantity: 1 })
const coupon = (c: Partial<Stripe.Coupon>) => ({ discounts: [{ coupon: c }] })

describe('subscriptionMrr (P1-7)', () => {
  it('normalizes monthly and annual to a monthly figure', () => {
    expect(subscriptionMrr(sub([monthly(10000)]))).toBe(100)
    expect(subscriptionMrr(sub([annual(120000)]))).toBe(100)
  })

  it('returns 0 for non-paying statuses', () => {
    expect(subscriptionMrr(sub([monthly(10000)], { status: 'canceled' }))).toBe(0)
    expect(subscriptionMrr(sub([monthly(10000)], { status: 'trialing' }))).toBe(0)
  })

  it('applies a recurring percent_off coupon', () => {
    expect(subscriptionMrr(sub([monthly(10000)], coupon({ percent_off: 50, duration: 'forever' })))).toBe(50)
  })

  it('ignores a one-time coupon (does not reduce ongoing MRR)', () => {
    expect(subscriptionMrr(sub([monthly(10000)], coupon({ percent_off: 50, duration: 'once' })))).toBe(100)
  })

  it('applies a recurring amount_off coupon prorated to a month', () => {
    // $120/yr = $10/mo; $12/yr amount_off = $1/mo off → $9/mo
    expect(subscriptionMrr(sub([annual(12000)], coupon({ amount_off: 1200, duration: 'repeating' })))).toBeCloseTo(9, 5)
  })

  it('sums multiple items', () => {
    expect(subscriptionMrr(sub([monthly(10000), monthly(2500)]))).toBe(125)
  })
})

describe('logoChurnRate (P1-6)', () => {
  it('uses the start-of-window base (active − joined + cancelled)', () => {
    // 100 active now, 10 joined this window, 5 cancelled → base 95 → 5/95
    expect(logoChurnRate(100, 10, 5)).toBeCloseTo(5 / 95, 6)
  })
  it('is 0 when nobody churned', () => {
    expect(logoChurnRate(100, 10, 0)).toBe(0)
  })
  it('is 0 when the start base is empty', () => {
    expect(logoChurnRate(5, 5, 0)).toBe(0)
  })
})
