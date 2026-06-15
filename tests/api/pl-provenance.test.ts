/**
 * Provenance drill-down — the drawer's reason to exist is that its total
 * equals the figure on screen EXACTLY. These tests don't assume anything
 * about the classifier's internals: they run the REAL incomeStatement over
 * the same fixture and assert the route reproduces its numbers. If the
 * classifier ever changes, both sides move together — by construction.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/metrics/ledger', () => ({
  loadPrimaryLedger: jest.fn(),
  categoryOverrides: jest.fn().mockResolvedValue({}),
  startOfYearUTC: (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), 0, 1)),
}))

import { GET } from '@/app/api/pl/provenance/route'
import { incomeStatement } from '@/lib/metrics/compute'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock
  getDefaultOrgId: jest.Mock
}
const { loadPrimaryLedger, categoryOverrides } = jest.requireMock('@/lib/metrics/ledger') as {
  loadPrimaryLedger: jest.Mock
  categoryOverrides: jest.Mock
}

const year = new Date().getUTCFullYear()
const txn = (iso: string, amount: number, type: 'CREDIT' | 'DEBIT', desc: string, category = '') => ({
  source: 'plaid',
  type,
  amount,
  category,
  description: desc,
  merchantName: null,
  date: new Date(iso),
  externalId: `${desc}-${iso}`,
})

// A month of plausible bank activity (current year so YTD covers it).
const LEDGER = [
  txn(`${year}-03-02T00:00:00Z`, 5000, 'CREDIT', 'Customer payment ACH'),
  txn(`${year}-03-05T00:00:00Z`, 129.99, 'DEBIT', 'AWS'),
  txn(`${year}-03-09T00:00:00Z`, 49, 'DEBIT', 'Figma'),
  txn(`${year}-03-15T00:00:00Z`, 2200, 'DEBIT', 'WeWork rent'),
  txn(`${year}-03-21T00:00:00Z`, 1500, 'CREDIT', 'Invoice 1042 payment'),
  txn(`${year}-04-03T00:00:00Z`, 300, 'DEBIT', 'Google Ads'), // next month — must be excluded from March
]

const get = (qs: string) => GET(new Request(`http://test/api/pl/provenance?${qs}`))

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ id: 'u1', email: 'u1@test.io' })
  getDefaultOrgId.mockResolvedValue('org1')
  loadPrimaryLedger.mockResolvedValue(LEDGER)
  categoryOverrides.mockResolvedValue({}) // clearAllMocks wipes the factory impl
})

describe('GET /api/pl/provenance — sums reconcile with the metric engine', () => {
  const march = `${year}-03`
  const marchWindow = {
    from: new Date(Date.UTC(year, 2, 1)),
    to: new Date(Date.UTC(year, 3, 1, 0, 0, 0, -1)), // inWindow is inclusive; route uses < next month
  }

  it('month expenses match incomeStatement.totalExpenses exactly', async () => {
    const expected = incomeStatement(LEDGER, marchWindow.from, marchWindow.to)
    const body = await (await get(`scope=month&month=${march}&bucket=expenses`)).json()
    expect(body.total).toBe(expected.totalExpenses)
    expect(body.total).toBeGreaterThan(0) // fixture sanity — not a 0 ≡ 0 pass
  })

  it('month income matches incomeStatement.totalIncome exactly', async () => {
    const expected = incomeStatement(LEDGER, marchWindow.from, marchWindow.to)
    const body = await (await get(`scope=month&month=${march}&bucket=income`)).json()
    expect(body.total).toBe(expected.totalIncome)
  })

  it('category filter reproduces the expensesByCategory entry', async () => {
    const expected = incomeStatement(LEDGER, marchWindow.from, marchWindow.to)
    for (const { category, amount } of expected.expensesByCategory) {
      const body = await (await get(`scope=month&month=${march}&bucket=expenses&category=${encodeURIComponent(category)}`)).json()
      expect(body.total).toBe(amount)
    }
  })

  it('category totals partition the whole: sum of categories = total expenses', async () => {
    const expected = incomeStatement(LEDGER, marchWindow.from, marchWindow.to)
    const sum = expected.expensesByCategory.reduce((s, c) => s + c.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(expected.totalExpenses)
  })

  it('YTD scope covers all months including the next-month row', async () => {
    const expected = incomeStatement(LEDGER, new Date(Date.UTC(year, 0, 1)))
    const body = await (await get('scope=ytd&bucket=expenses')).json()
    expect(body.total).toBe(expected.totalExpenses)
    expect(body.count).toBeGreaterThan(3) // includes April's Google Ads row
  })

  it('rows are newest-first and carry source + description', async () => {
    const body = await (await get(`scope=month&month=${march}&bucket=expenses`)).json()
    const dates = body.rows.map((r: { date: string }) => r.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(body.rows[0].source).toBe('plaid')
  })

  it('400s on a malformed month and on month-scope without month', async () => {
    expect((await get('scope=month&month=2026-13&bucket=income')).status).toBe(400)
    expect((await get('scope=month&bucket=income')).status).toBe(400)
  })

  it('401s when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new Error('UNAUTHORIZED'))
    expect((await get('scope=ytd&bucket=income')).status).toBe(401)
  })
})
