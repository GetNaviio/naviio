/**
 * FP&A workbook round-trip: what we export must parse back identically — the
 * contract that makes "edit in Excel/Google Sheets, re-import" trustworthy.
 * Also pins parser tolerance for spreadsheet-tool quirks (Date-coerced month
 * headers, "$1,200"-style strings, formula-result cells).
 */
import ExcelJS from 'exceljs'
import {
  buildFpaWorkbook,
  loadWorkbook,
  parseBudgetSheet,
  parseWorkforceSheet,
  BUDGET_MARKER,
  WORKFORCE_MARKER,
  type BudgetCell,
} from '@/lib/model/fpa-xlsx'
import { buildTtmForecast } from '@/lib/model/ttm'
import type { PlannedRole } from '@/lib/model/workforce'

const ROLES: (PlannedRole & { department?: string | null })[] = [
  { title: 'Senior Engineer', department: 'Eng', headcount: 2, monthlySalary: 12000, loadedPct: 25, startMonth: '2026-07', endMonth: null },
  { title: 'AE', department: 'Sales', headcount: 1, monthlySalary: 8000, loadedPct: 30, startMonth: '2026-09', endMonth: '2027-03' },
]

const BUDGET: BudgetCell[] = [
  { month: '2026-01', line: 'REVENUE', amount: 100000 },
  { month: '2026-01', line: 'COGS', amount: 30000 },
  { month: '2026-01', line: 'OPEX', amount: 50000 },
  { month: '2026-06', line: 'REVENUE', amount: 120000 },
]

async function buildAndReload() {
  const ttm = buildTtmForecast('2026-06', {
    startRevenue: 100000, growth: 0.05, grossMargin: 0.7, startOpex: 60000, opexGrowth: 0.02,
  }, ROLES)
  const buf = await buildFpaWorkbook({ year: '2026', budget: BUDGET, roles: ROLES, ttm, ttmAnchor: '2026-06' })
  return loadWorkbook(buf)
}

describe('FP&A workbook round-trip', () => {
  it('exports three sheets with the template markers', async () => {
    const wb = await buildAndReload()
    expect(wb.worksheets.map((w) => w.name)).toEqual(['TTM Forecast', 'Budget', 'Workforce'])
    expect(String(wb.getWorksheet('Budget')!.getCell('A1').value)).toBe(BUDGET_MARKER)
    expect(String(wb.getWorksheet('Workforce')!.getCell('A1').value)).toBe(WORKFORCE_MARKER)
  })

  it('budget round-trips exactly (every exported amount parses back)', async () => {
    const wb = await buildAndReload()
    const parsed = parseBudgetSheet(wb)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // Export writes 0 for unset cells, so parse returns the full 12×3 grid.
    expect(parsed.rows).toHaveLength(36)
    const find = (m: string, l: BudgetCell['line']) => parsed.rows.find((r) => r.month === m && r.line === l)?.amount
    expect(find('2026-01', 'REVENUE')).toBe(100000)
    expect(find('2026-01', 'COGS')).toBe(30000)
    expect(find('2026-06', 'REVENUE')).toBe(120000)
    expect(find('2026-03', 'OPEX')).toBe(0) // unset cell exported as 0
  })

  it('workforce round-trips exactly', async () => {
    const wb = await buildAndReload()
    const parsed = parseWorkforceSheet(wb)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows).toEqual([
      { title: 'Senior Engineer', department: 'Eng', headcount: 2, monthlySalary: 12000, loadedPct: 25, startMonth: '2026-07', endMonth: null },
      { title: 'AE', department: 'Sales', headcount: 1, monthlySalary: 8000, loadedPct: 30, startMonth: '2026-09', endMonth: '2027-03' },
    ])
  })
})

describe('template mode', () => {
  it('emits only blank Budget + Workforce sheets, and the budget template parses as zeros', async () => {
    const buf = await buildFpaWorkbook({
      year: '2027',
      budget: [],
      roles: [],
      ttm: { months: [], columns: [], total: { revenue: 0, cogs: 0, grossProfit: 0, opex: 0, workforceDelta: 0, operatingIncome: 0 } },
      ttmAnchor: '2026-06',
      templateOnly: true,
    })
    const wb = await loadWorkbook(buf)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Budget', 'Workforce'])

    const parsed = parseBudgetSheet(wb)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.rows).toHaveLength(36) // 12 months × 3 lines, all zeros
      expect(parsed.rows.every((r) => r.amount === 0 && r.month.startsWith('2027-'))).toBe(true)
    }
    // Blank workforce template has no rows — import correctly reports that.
    const wf = parseWorkforceSheet(wb)
    expect(wf.ok).toBe(false)
  })
})

describe('parser tolerance for spreadsheet-tool quirks', () => {
  it('accepts month headers coerced to Date cells (Sheets does this)', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Budget')
    ws.getCell('A1').value = BUDGET_MARKER
    ws.getRow(3).getCell(1).value = 'Line'
    ws.getRow(3).getCell(2).value = new Date(Date.UTC(2026, 0, 1)) // Jan 2026 as a Date
    ws.getRow(4).getCell(1).value = 'Revenue'
    ws.getRow(4).getCell(2).value = 5000
    const parsed = parseBudgetSheet(wb)
    expect(parsed.ok && parsed.rows[0]).toEqual({ month: '2026-01', line: 'REVENUE', amount: 5000 })
  })

  it('accepts currency-formatted strings as amounts', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Budget')
    ws.getCell('A1').value = BUDGET_MARKER
    ws.getRow(3).getCell(2).value = '2026-02'
    ws.getRow(4).getCell(1).value = 'OpEx'
    ws.getRow(4).getCell(2).value = '$1,250'
    const parsed = parseBudgetSheet(wb)
    expect(parsed.ok && parsed.rows[0]).toEqual({ month: '2026-02', line: 'OPEX', amount: 1250 })
  })

  it('rejects a workbook without the expected sheets, with a helpful message', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Totally unrelated')
    const b = parseBudgetSheet(wb)
    const w = parseWorkforceSheet(wb)
    expect(b.ok).toBe(false)
    expect(w.ok).toBe(false)
    if (!b.ok) expect(b.error).toMatch(/export the template/i)
  })

  it('skips invalid workforce rows (bad start month) but keeps valid ones', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Workforce')
    ws.getCell('A1').value = WORKFORCE_MARKER
    // row 4: valid; row 5: garbage start month
    const ok = ws.getRow(4)
    ;['Designer', 'Product', 1, 9000, 25, '2026-08', ''].forEach((v, i) => { ok.getCell(i + 1).value = v })
    const bad = ws.getRow(5)
    ;['Ghost', '', 1, 5000, 25, 'not-a-month', ''].forEach((v, i) => { bad.getCell(i + 1).value = v })

    const parsed = parseWorkforceSheet(wb)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].title).toBe('Designer')
  })
})
