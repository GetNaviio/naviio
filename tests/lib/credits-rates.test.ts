import { costOf, hasEnough, packById, pricePerCredit, CREDIT_PACKS, FEATURE_COST } from '@/lib/credits/rates'

describe('credit rates', () => {
  it('charges defined costs per feature', () => {
    expect(costOf('navi_message')).toBe(FEATURE_COST.navi_message)
    expect(costOf('plaid_sync')).toBe(2)
    expect(costOf('realtime_refresh')).toBe(3)
  })

  it('hasEnough gates on balance', () => {
    expect(hasEnough(0, 'navi_message')).toBe(false)
    expect(hasEnough(1, 'navi_message')).toBe(true)
    expect(hasEnough(1, 'plaid_sync')).toBe(false)
    expect(hasEnough(2, 'plaid_sync')).toBe(true)
  })

  it('resolves the reload pack and price', () => {
    const reload = packById('reload')!
    expect(reload.credits).toBe(100)
    expect(reload.priceCents).toBe(1000)
    expect(packById('nope')).toBeUndefined()
    expect(pricePerCredit(reload)).toBeCloseTo(10) // 1000c / 100 credits
  })

  it('all packs are well-formed', () => {
    for (const p of CREDIT_PACKS) {
      expect(p.credits).toBeGreaterThan(0)
      expect(p.priceCents).toBeGreaterThan(0)
      expect(p.id).toBeTruthy()
    }
  })
})
