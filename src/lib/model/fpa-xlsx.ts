/**
 * FP&A workbook export + import (xlsx). One file format covers both Excel and
 * Google Sheets (Sheets opens .xlsx and exports via File ▸ Download ▸ .xlsx).
 *
 * The exported Budget and Workforce sheets ARE the import templates — a user
 * exports, edits in their spreadsheet tool, and re-imports the same file.
 * Parsers are tolerant of spreadsheet-tool quirks: month cells that came back
 * as Dates, numbers that came back as formula results, currency-formatted
 * strings ("$1,200").
 *
 * Server-only (exceljs). Pure with respect to inputs — no DB access here.
 */
import ExcelJS from 'exceljs'
import type { PlannedRole } from './workforce'
import type { TtmTable } from './ttm'

// ─── Sheet layout contracts (shared by builder and parser) ─────────────────────

export const BUDGET_MARKER = 'Naviio Budget'
export const WORKFORCE_MARKER = 'Naviio Workforce Plan'
const BUDGET_LINES = ['Revenue', 'COGS', 'OpEx'] as const
const WORKFORCE_HEADERS = ['Title', 'Department', 'Headcount', 'Monthly Salary', 'Loaded %', 'Start Month', 'End Month'] as const

export type BudgetLineKind = 'REVENUE' | 'COGS' | 'OPEX'
export interface BudgetCell { month: string; line: BudgetLineKind; amount: number }

// ─── Cell coercion helpers (spreadsheet tools mangle types) ────────────────────

/** Numeric value from a cell that may be a number, formula result, or "$1,200". */
function cellNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,\s]/g, ''))
    return Number.isFinite(n) && v.trim() !== '' ? n : null
  }
  return null
}

function cellString(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('result' in v && v.result != null) return cellString(v.result as ExcelJS.CellValue)
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim()
    if ('text' in v && typeof v.text === 'string') return v.text.trim()
  }
  return ''
}

/** 'YYYY-MM' from a cell that may be a string, a Date, or "Jun 26"-style text. */
function cellYm(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const s = cellString(v)
  const m = s.match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const parsed = new Date(s)
  if (s && !Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return null
}

// ─── Builder ───────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }
const USD = '$#,##0'

export interface FpaWorkbookInput {
  year: string // budget year, 'YYYY'
  budget: BudgetCell[]
  roles: (PlannedRole & { department?: string | null })[]
  ttm: TtmTable
  ttmAnchor: string
  /** Template mode: emit only the blank Budget + Workforce import sheets. */
  templateOnly?: boolean
}

export async function buildFpaWorkbook(input: FpaWorkbookInput): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Naviio'

  if (!input.templateOnly) buildTtmSheet(wb, input)
  buildBudgetSheet(wb, input)
  buildWorkforceSheet(wb, input)
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

function buildTtmSheet(wb: ExcelJS.Workbook, input: FpaWorkbookInput): void {
  // ── TTM Forecast (export-only, plain values, months on columns) ──
  const ttmWs = wb.addWorksheet('TTM Forecast')
  ttmWs.getCell('A1').value = `Naviio TTM Forecast — anchored ${input.ttmAnchor}`
  ttmWs.getCell('A1').font = { bold: true }
  const ttmHeader = ttmWs.getRow(3)
  ttmHeader.getCell(1).value = 'Line'
  input.ttm.months.forEach((m, i) => { ttmHeader.getCell(2 + i).value = m })
  ttmHeader.getCell(2 + input.ttm.months.length).value = '12-mo total'
  ttmHeader.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT })

  const ttmRows: { label: string; pick: (c: (typeof input.ttm.columns)[number]) => number; total: number }[] = [
    { label: 'Revenue', pick: (c) => c.revenue, total: input.ttm.total.revenue },
    { label: 'COGS', pick: (c) => -c.cogs, total: -input.ttm.total.cogs },
    { label: 'Gross Profit', pick: (c) => c.grossProfit, total: input.ttm.total.grossProfit },
    { label: 'OpEx', pick: (c) => -c.opex, total: -input.ttm.total.opex },
    { label: 'Workforce plan Δ', pick: (c) => -c.workforceDelta, total: -input.ttm.total.workforceDelta },
    { label: 'Operating Income', pick: (c) => c.operatingIncome, total: input.ttm.total.operatingIncome },
  ]
  ttmRows.forEach((r, ri) => {
    const row = ttmWs.getRow(4 + ri)
    row.getCell(1).value = r.label
    input.ttm.columns.forEach((c, ci) => {
      const cell = row.getCell(2 + ci)
      cell.value = r.pick(c)
      cell.numFmt = USD
    })
    const totalCell = row.getCell(2 + input.ttm.columns.length)
    totalCell.value = r.total
    totalCell.numFmt = USD
  })
  ttmWs.getColumn(1).width = 22
}

function buildBudgetSheet(wb: ExcelJS.Workbook, input: FpaWorkbookInput): void {
  // ── Budget (import template — see parseBudgetSheet) ──
  const bWs = wb.addWorksheet('Budget')
  bWs.getCell('A1').value = BUDGET_MARKER
  bWs.getCell('A1').font = { bold: true }
  bWs.getCell('B1').value = input.year
  bWs.getCell('A2').value = 'Edit amounts, then re-import this file in Naviio (Financial Model ▸ Budget vs Actuals).'
  bWs.getCell('A2').font = { italic: true, size: 9 }

  const months = Array.from({ length: 12 }, (_, i) => `${input.year}-${String(i + 1).padStart(2, '0')}`)
  const bHeader = bWs.getRow(3)
  bHeader.getCell(1).value = 'Line'
  months.forEach((m, i) => {
    const c = bHeader.getCell(2 + i)
    c.value = m // write as TEXT — parser also tolerates Date coercion
  })
  bHeader.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT })

  const byKey = new Map(input.budget.map((b) => [`${b.month}|${b.line}`, b.amount]))
  BUDGET_LINES.forEach((label, li) => {
    const line = label.toUpperCase() as BudgetLineKind
    const row = bWs.getRow(4 + li)
    row.getCell(1).value = label
    months.forEach((m, mi) => {
      const cell = row.getCell(2 + mi)
      cell.value = byKey.get(`${m}|${line}`) ?? 0
      cell.numFmt = USD
    })
  })
  bWs.getColumn(1).width = 14
}

function buildWorkforceSheet(wb: ExcelJS.Workbook, input: FpaWorkbookInput): void {
  // ── Workforce (import template — see parseWorkforceSheet) ──
  const wWs = wb.addWorksheet('Workforce')
  wWs.getCell('A1').value = WORKFORCE_MARKER
  wWs.getCell('A1').font = { bold: true }
  wWs.getCell('A2').value = 'Add/edit rows, then re-import (Financial Model ▸ Workforce Planning). Months are YYYY-MM; End Month blank = ongoing.'
  wWs.getCell('A2').font = { italic: true, size: 9 }

  const wHeader = wWs.getRow(3)
  WORKFORCE_HEADERS.forEach((h, i) => { wHeader.getCell(1 + i).value = h })
  wHeader.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT })

  input.roles.forEach((r, ri) => {
    const row = wWs.getRow(4 + ri)
    row.getCell(1).value = r.title
    row.getCell(2).value = r.department ?? ''
    row.getCell(3).value = r.headcount
    row.getCell(4).value = r.monthlySalary
    row.getCell(4).numFmt = USD
    row.getCell(5).value = r.loadedPct
    row.getCell(6).value = r.startMonth
    row.getCell(7).value = r.endMonth ?? ''
  })
  wWs.getColumn(1).width = 24
  wWs.getColumn(2).width = 14
  ;[4, 6, 7].forEach((c) => { wWs.getColumn(c).width = 14 })
}

// ─── Parsers ───────────────────────────────────────────────────────────────────

export interface ParseResultOk<T> { ok: true; rows: T[] }
export interface ParseResultErr { ok: false; error: string }
export type ParseResult<T> = ParseResultOk<T> | ParseResultErr

/** Find the sheet carrying a marker in A1 (falls back to sheet name match). */
function findSheet(wb: ExcelJS.Workbook, marker: string, nameHint: string): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    if (cellString(ws.getCell('A1').value).startsWith(marker)) return ws
  }
  return wb.worksheets.find((w) => w.name.toLowerCase() === nameHint) ?? null
}

export async function loadWorkbook(buf: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

/**
 * Parse the Budget sheet (grid: line rows × month columns). Returns long-form
 * cells ready for upsert. Tolerates month headers coerced to Dates and amounts
 * formatted as currency strings.
 */
export function parseBudgetSheet(wb: ExcelJS.Workbook): ParseResult<BudgetCell> {
  const ws = findSheet(wb, BUDGET_MARKER, 'budget')
  if (!ws) return { ok: false, error: 'No Budget sheet found — export the template from Naviio first.' }

  // Months from header row 3, columns B onward.
  const header = ws.getRow(3)
  const months: { col: number; ym: string }[] = []
  for (let col = 2; col <= 40; col++) {
    const ym = cellYm(header.getCell(col).value)
    if (ym) months.push({ col, ym })
    else if (months.length > 0) break // stop at first gap after months began
  }
  if (months.length === 0) return { ok: false, error: 'No month columns found in row 3 of the Budget sheet.' }

  const rows: BudgetCell[] = []
  for (let r = 4; r <= ws.rowCount; r++) {
    const label = cellString(ws.getRow(r).getCell(1).value).toUpperCase()
    const known: BudgetLineKind | null =
      label === 'REVENUE' ? 'REVENUE' : label === 'COGS' ? 'COGS' : label === 'OPEX' ? 'OPEX' : null
    if (!known) continue
    for (const { col, ym } of months) {
      const n = cellNumber(ws.getRow(r).getCell(col).value)
      if (n != null && n >= 0) rows.push({ month: ym, line: known, amount: Math.round(n) })
    }
  }
  if (rows.length === 0) return { ok: false, error: 'No Revenue/COGS/OpEx rows with amounts found.' }
  return { ok: true, rows }
}

export interface ParsedRole {
  title: string
  department: string | null
  headcount: number
  monthlySalary: number
  loadedPct: number
  startMonth: string
  endMonth: string | null
}

/** Parse the Workforce sheet (one role per row, headers in row 3). */
export function parseWorkforceSheet(wb: ExcelJS.Workbook): ParseResult<ParsedRole> {
  const ws = findSheet(wb, WORKFORCE_MARKER, 'workforce')
  if (!ws) return { ok: false, error: 'No Workforce sheet found — export the template from Naviio first.' }

  const rows: ParsedRole[] = []
  const problems: string[] = []
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const title = cellString(row.getCell(1).value)
    if (!title) continue // blank row = end of data (or skip stray rows)

    const startMonth = cellYm(row.getCell(6).value)
    if (!startMonth) {
      problems.push(`Row ${r} ("${title}"): Start Month must be YYYY-MM.`)
      continue
    }
    const endRaw = cellString(row.getCell(7).value)
    const endMonth = endRaw ? cellYm(row.getCell(7).value) : null
    if (endRaw && !endMonth) {
      problems.push(`Row ${r} ("${title}"): End Month must be YYYY-MM or blank.`)
      continue
    }
    if (endMonth && endMonth < startMonth) {
      problems.push(`Row ${r} ("${title}"): End Month precedes Start Month.`)
      continue
    }
    const headcount = cellNumber(row.getCell(3).value)
    const salary = cellNumber(row.getCell(4).value)
    const loaded = cellNumber(row.getCell(5).value)
    if (headcount == null || headcount < 1 || salary == null || salary < 0) {
      problems.push(`Row ${r} ("${title}"): Headcount and Monthly Salary must be positive numbers.`)
      continue
    }

    rows.push({
      title: title.slice(0, 100),
      department: cellString(row.getCell(2).value).slice(0, 60) || null,
      headcount: Math.round(headcount),
      monthlySalary: salary,
      loadedPct: loaded != null && loaded >= 0 && loaded <= 200 ? loaded : 25,
      startMonth,
      endMonth,
    })
  }

  if (rows.length === 0) {
    return { ok: false, error: problems[0] ?? 'No role rows found below the header (row 4 onward).' }
  }
  // Partial success is allowed; surface the first problem as a warning upstream if desired.
  return { ok: true, rows }
}
