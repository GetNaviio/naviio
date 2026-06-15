import {
  parseQBOProfitAndLoss,
  parseQBOInvoices,
  parseXeroProfitAndLoss,
  parseXeroInvoices,
  summarizeAccounting,
} from '@/lib/integrations/accounting-map'

// ─── QuickBooks fixtures ─────────────────────────────────────────────────────
const qboPL = {
  Header: { Currency: 'USD', ReportName: 'ProfitAndLoss' },
  Rows: {
    Row: [
      { group: 'Income', type: 'Section', Summary: { ColData: [{ value: 'Total Income' }, { value: '120000.00' }] } },
      { group: 'COGS', type: 'Section', Summary: { ColData: [{ value: 'Total COGS' }, { value: '30000.00' }] } },
      { group: 'GrossProfit', type: 'Section', Summary: { ColData: [{ value: 'Gross Profit' }, { value: '90000.00' }] } },
      { group: 'Expenses', type: 'Section', Summary: { ColData: [{ value: 'Total Expenses' }, { value: '55000.00' }] } },
      { group: 'NetIncome', type: 'Section', Summary: { ColData: [{ value: 'Net Income' }, { value: '35000.00' }] } },
    ],
  },
}

const qboInvoices = {
  QueryResponse: {
    Invoice: [
      { Balance: 1500.0 },
      { Balance: 0 },
      { Balance: 2500.5 },
    ],
  },
}

// ─── Xero fixtures ───────────────────────────────────────────────────────────
const xeroPL = {
  Reports: [
    {
      ReportName: 'Profit and Loss',
      Rows: [
        { RowType: 'Header', Cells: [{ Value: '' }, { Value: 'YTD' }] },
        {
          RowType: 'Section',
          Title: 'Income',
          Rows: [
            { RowType: 'Row', Cells: [{ Value: 'Sales' }, { Value: '80000.00' }] },
            { RowType: 'SummaryRow', Cells: [{ Value: 'Total Income' }, { Value: '80000.00' }] },
          ],
        },
        {
          RowType: 'Section',
          Title: 'Less Operating Expenses',
          Rows: [
            { RowType: 'Row', Cells: [{ Value: 'Rent' }, { Value: '12000.00' }] },
            { RowType: 'SummaryRow', Cells: [{ Value: 'Total Operating Expenses' }, { Value: '50000.00' }] },
          ],
        },
        {
          RowType: 'Section',
          Title: '',
          Rows: [{ RowType: 'Row', Cells: [{ Value: 'Net Profit' }, { Value: '30000.00' }] }],
        },
      ],
    },
  ],
}

const xeroInvoices = {
  Invoices: [
    { AmountDue: 900.0, Status: 'AUTHORISED' },
    { AmountDue: 0, Status: 'PAID' },
    { AmountDue: 1100.25, Status: 'AUTHORISED' },
  ],
}

describe('QuickBooks parsers', () => {
  it('extracts income/expenses/net/gross + currency from a P&L report', () => {
    const r = parseQBOProfitAndLoss(qboPL)
    expect(r.totalIncome).toBe(120000)
    expect(r.totalExpenses).toBe(55000)
    expect(r.grossProfit).toBe(90000)
    expect(r.netIncome).toBe(35000)
    expect(r.currency).toBe('USD')
  })

  it('tallies only positive-balance invoices', () => {
    const r = parseQBOInvoices(qboInvoices)
    expect(r.outstandingCount).toBe(2)
    expect(r.outstandingAmount).toBeCloseTo(4000.5, 2)
  })

  it('is null-safe on empty input', () => {
    expect(parseQBOProfitAndLoss(null)).toEqual({ currency: null })
    expect(parseQBOInvoices(null)).toEqual({ outstandingCount: 0, outstandingAmount: 0 })
  })
})

describe('Xero parsers', () => {
  it('matches section/summary labels by pattern', () => {
    const r = parseXeroProfitAndLoss(xeroPL)
    expect(r.totalIncome).toBe(80000)
    expect(r.totalExpenses).toBe(50000)
    expect(r.netIncome).toBe(30000)
  })

  it('tallies only invoices with amount due', () => {
    const r = parseXeroInvoices(xeroInvoices)
    expect(r.outstandingCount).toBe(2)
    expect(r.outstandingAmount).toBeCloseTo(2000.25, 2)
  })

  it('is null-safe on empty input', () => {
    expect(parseXeroProfitAndLoss(null)).toEqual({})
    expect(parseXeroInvoices(null)).toEqual({ outstandingCount: 0, outstandingAmount: 0 })
  })
})

describe('summarizeAccounting', () => {
  it('prefers QuickBooks when both are present', () => {
    const s = summarizeAccounting(
      { profitAndLoss: qboPL, invoices: qboInvoices },
      { profitAndLoss: xeroPL, invoices: xeroInvoices },
    )
    expect(s?.source).toBe('quickbooks')
    expect(s?.netIncome).toBe(35000)
    expect(s?.outstandingCount).toBe(2)
  })

  it('falls back to Xero when QBO is absent', () => {
    const s = summarizeAccounting(null, { profitAndLoss: xeroPL, invoices: xeroInvoices })
    expect(s?.source).toBe('xero')
    expect(s?.totalIncome).toBe(80000)
  })

  it('returns null when neither has data', () => {
    expect(summarizeAccounting(null, null)).toBeNull()
    expect(summarizeAccounting({}, {})).toBeNull()
  })
})
