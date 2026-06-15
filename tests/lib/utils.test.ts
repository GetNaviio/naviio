import {
  formatCurrency,
  formatPercent,
  formatNumber,
  timeAgo,
  calcGrowthRate,
  calcMarginPct,
  calcRunway,
  calcLtv,
  calcMagicNumber,
  calcRule40,
  clamp,
} from '@/lib/utils'

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats whole dollar amounts', () => {
    expect(formatCurrency(1000)).toBe('$1,000')
    expect(formatCurrency(0)).toBe('$0')
    expect(formatCurrency(-500)).toBe('-$500')
  })

  it('compacts millions', () => {
    expect(formatCurrency(1500000, true)).toBe('$1.5M')
    expect(formatCurrency(2000000, true)).toBe('$2.0M')
  })

  it('compacts thousands', () => {
    expect(formatCurrency(135000, true)).toBe('$135K')
    expect(formatCurrency(1000, true)).toBe('$1K')
  })

  it('does not compact when compact=false', () => {
    expect(formatCurrency(135000, false)).toBe('$135,000')
  })
})

// ─── formatPercent ────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('prefixes positive values with +', () => {
    expect(formatPercent(5.5)).toBe('+5.5%')
    expect(formatPercent(0)).toBe('+0.0%')
  })

  it('keeps the minus sign for negatives', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%')
  })

  it('respects decimal places', () => {
    expect(formatPercent(1.23456, 2)).toBe('+1.23%')
    expect(formatPercent(1.23456, 0)).toBe('+1%')
  })
})

// ─── formatNumber ─────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('formats with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('compacts large numbers', () => {
    expect(formatNumber(2500000, true)).toBe('2.5M')
    expect(formatNumber(3000, true)).toBe('3K')
  })
})

// ─── timeAgo ─────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  const now = Date.now()

  it('returns "just now" for sub-minute timestamps', () => {
    expect(timeAgo(new Date(now - 30_000).toISOString())).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago')
  })

  it('returns days ago', () => {
    expect(timeAgo(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago')
  })
})

// ─── Financial calculations ───────────────────────────────────────────────────

describe('calcGrowthRate', () => {
  it('calculates percentage growth', () => {
    expect(calcGrowthRate(110, 100)).toBeCloseTo(10)
    expect(calcGrowthRate(90, 100)).toBeCloseTo(-10)
  })

  it('returns 0 when prior is 0', () => {
    expect(calcGrowthRate(100, 0)).toBe(0)
  })
})

describe('calcMarginPct', () => {
  it('calculates gross margin', () => {
    expect(calcMarginPct(75000, 100000)).toBe(75)
    expect(calcMarginPct(0, 100000)).toBe(0)
  })

  it('returns 0 when revenue is 0', () => {
    expect(calcMarginPct(50, 0)).toBe(0)
  })
})

describe('calcRunway', () => {
  it('divides cash by burn', () => {
    expect(calcRunway(600000, 50000)).toBe(12)
    expect(calcRunway(0, 50000)).toBe(0)
  })

  it('returns Infinity when burn is 0', () => {
    expect(calcRunway(600000, 0)).toBe(Infinity)
  })

  it('returns Infinity when burn is negative (cash-positive)', () => {
    expect(calcRunway(600000, -10000)).toBe(Infinity)
  })
})

describe('calcLtv', () => {
  it('calculates LTV as ARPU / churn', () => {
    // $499 ARPU, 3% churn → LTV = 499 / 0.03 ≈ 16,633
    expect(calcLtv(499, 3)).toBeCloseTo(16633, 0)
  })

  it('returns 0 when churn is 0', () => {
    expect(calcLtv(499, 0)).toBe(0)
  })
})

describe('calcMagicNumber', () => {
  it('calculates sales efficiency', () => {
    expect(calcMagicNumber(100000, 50000)).toBe(2)
  })

  it('returns 0 when S&M spend is 0', () => {
    expect(calcMagicNumber(100000, 0)).toBe(0)
  })
})

describe('calcRule40', () => {
  it('sums growth and margin', () => {
    expect(calcRule40(30, 15)).toBe(45)
    expect(calcRule40(50, -10)).toBe(40)
  })
})

describe('clamp', () => {
  it('clamps to min', () => expect(clamp(-5, 0, 100)).toBe(0))
  it('clamps to max', () => expect(clamp(150, 0, 100)).toBe(100))
  it('passes through in-range values', () => expect(clamp(50, 0, 100)).toBe(50))
})
