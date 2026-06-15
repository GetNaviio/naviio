import { mapStripeCharge } from '@/lib/integrations/stripe-map'
import type Stripe from 'stripe'

function charge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: 'ch_1',
    amount: 4999, // cents
    currency: 'usd',
    created: 1_716_000_000, // 2024-05-18T...
    description: 'Pro plan',
    statement_descriptor: 'NAVIIO',
    billing_details: { name: 'Acme Inc' },
    paid: true,
    refunded: false,
    ...overrides,
  } as unknown as Stripe.Charge
}

describe('mapStripeCharge', () => {
  const ORG = 'org_1'
  const INT = 'int_1'

  it('maps a charge to a CREDIT transaction with externalId = charge id', () => {
    const row = mapStripeCharge(ORG, INT, charge())
    expect(row.orgId).toBe(ORG)
    expect(row.integrationId).toBe(INT)
    expect(row.externalId).toBe('ch_1')
    expect(row.type).toBe('CREDIT')
    expect(row.source).toBe('stripe')
    expect(row.category).toBe('REVENUE')
  })

  it('converts cents to a major-unit amount', () => {
    expect(mapStripeCharge(ORG, INT, charge({ amount: 4999 })).amount).toBeCloseTo(49.99, 5)
    expect(mapStripeCharge(ORG, INT, charge({ amount: 100 })).amount).toBe(1)
  })

  it('stores revenue NET of refunds (contra-revenue, ASC 606)', () => {
    // partial refund: $50.00 charged, $20.00 refunded → $30.00 net
    expect(mapStripeCharge(ORG, INT, charge({ amount: 5000, amount_refunded: 2000 })).amount).toBeCloseTo(30, 5)
    // full refund → $0 net (never negative)
    expect(mapStripeCharge(ORG, INT, charge({ amount: 5000, amount_refunded: 5000 })).amount).toBe(0)
  })

  it('uppercases the currency and defaults to USD', () => {
    expect(mapStripeCharge(ORG, INT, charge({ currency: 'eur' })).currency).toBe('EUR')
    expect(
      mapStripeCharge(ORG, INT, charge({ currency: undefined as unknown as string })).currency,
    ).toBe('USD')
  })

  it('converts the Unix timestamp to a Date', () => {
    const row = mapStripeCharge(ORG, INT, charge({ created: 1_716_000_000 }))
    expect(row.date).toEqual(new Date(1_716_000_000 * 1000))
  })

  it('falls back to statement_descriptor then a default when description is missing', () => {
    expect(mapStripeCharge(ORG, INT, charge({ description: null })).description).toBe('NAVIIO')
    expect(
      mapStripeCharge(ORG, INT, charge({ description: null, statement_descriptor: null })).description,
    ).toBe('Stripe charge')
  })

  it('reads merchant name from billing_details, null when absent', () => {
    expect(mapStripeCharge(ORG, INT, charge()).merchantName).toBe('Acme Inc')
    expect(
      mapStripeCharge(ORG, INT, charge({ billing_details: { name: null } as Stripe.Charge.BillingDetails })).merchantName,
    ).toBeNull()
  })
})
