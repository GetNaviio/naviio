import { synthesizePL } from '@/lib/integrations/pl-synthesis'

describe('synthesizePL', () => {
  it('maps credits to income and debits to expenses', () => {
    expect(synthesizePL(120000, 70000)).toEqual({
      totalIncome: 120000,
      totalExpenses: 70000,
      netIncome: 50000,
    })
  })

  it('produces a negative net when expenses exceed income', () => {
    const r = synthesizePL(40000, 55000)
    expect(r.netIncome).toBe(-15000)
  })

  it('handles zero activity', () => {
    expect(synthesizePL(0, 0)).toEqual({ totalIncome: 0, totalExpenses: 0, netIncome: 0 })
  })
})
