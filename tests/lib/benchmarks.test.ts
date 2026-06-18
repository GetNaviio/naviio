import { amountToBucket, bucketValue, percentileValue, revenueToSegment, K_ANON } from '@/lib/benchmarks/buckets'

describe('benchmark buckets', () => {
  it('buckets monthly $ into half-octave bands and back', () => {
    expect(amountToBucket(0)).toBe(0)
    expect(amountToBucket(-5)).toBe(0)
    // round-trips to roughly the input
    for (const amt of [25, 49, 90, 149, 399, 1200]) {
      const v = bucketValue(amountToBucket(amt))
      expect(v).toBeGreaterThan(amt * 0.6)
      expect(v).toBeLessThan(amt * 1.6)
    }
  })

  it('estimates percentiles from a histogram', () => {
    // 10 orgs: 6 in a low bucket, 4 in a higher one.
    const low = amountToBucket(50)
    const high = amountToBucket(150)
    const hist = [{ bucket: low, orgs: 6 }, { bucket: high, orgs: 4 }]
    expect(percentileValue([], 0.5)).toBeNull()
    expect(percentileValue(hist, 0.5)).toBe(bucketValue(low)) // median falls in the low bucket
    expect(percentileValue(hist, 0.9)).toBe(bucketValue(high))
  })

  it('maps revenue to coarse size bands', () => {
    expect(revenueToSegment(0)).toBe('lt_250k')
    expect(revenueToSegment(500_000)).toBe('250k_1m')
    expect(revenueToSegment(3_000_000)).toBe('1m_5m')
    expect(revenueToSegment(10_000_000)).toBe('5m_20m')
    expect(revenueToSegment(50_000_000)).toBe('gt_20m')
  })

  it('keeps a privacy threshold', () => {
    expect(K_ANON).toBeGreaterThanOrEqual(5)
  })
})
