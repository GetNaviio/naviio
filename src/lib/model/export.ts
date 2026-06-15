import ExcelJS from 'exceljs'

/**
 * Build a live-formula .xlsx of the financial model: a blue assumptions block
 * plus a monthly projection whose cells are Excel FORMULAS referencing the
 * assumptions — so the user can change inputs in Excel and the model recalculates.
 */
export interface ModelAssumptions {
  months: number
  startRevenue: number
  growthPct: number // % per month
  grossMarginPct: number // %
  startOpex: number
  opexGrowthPct: number // %
}

const USD = '$#,##0'
const PCT = '0.0"%"'

// Absolute references to the assumption cells (B5..B9).
const REV0 = '$B$5'
const GROWTH = '$B$6'
const GM = '$B$7'
const OPEX0 = '$B$8'
const OPEXG = '$B$9'

export async function buildModelWorkbook(a: ModelAssumptions): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Naviio'
  const ws = wb.addWorksheet('Financial Model')
  ws.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }]

  const title = ws.getCell('A1')
  title.value = 'Naviio — Financial Model'
  title.font = { bold: true, size: 14 }
  ws.getCell('A2').value = 'Edit the blue assumptions; the monthly projection recalculates.'
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF888888' } }

  ws.getCell('A4').value = 'ASSUMPTIONS'
  ws.getCell('A4').font = { bold: true }
  const blue = { color: { argb: 'FF0000FF' } }
  const yellow = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF2CC' } }
  const inputs: [string, number, string][] = [
    ['Start revenue ($/mo)', a.startRevenue, USD],
    ['Monthly revenue growth', a.growthPct, PCT],
    ['Gross margin', a.grossMarginPct, PCT],
    ['Start OpEx ($/mo)', a.startOpex, USD],
    ['Monthly OpEx growth', a.opexGrowthPct, PCT],
  ]
  inputs.forEach(([label, val, fmt], i) => {
    const row = 5 + i
    ws.getCell(`A${row}`).value = label
    const c = ws.getCell(`B${row}`)
    c.value = val
    c.font = blue
    c.numFmt = fmt
    c.fill = yellow
  })

  const headRow = 11
  const headers = ['Month', 'Revenue', 'COGS', 'Gross Profit', 'OpEx', 'Operating Income']
  headers.forEach((h, i) => {
    const c = ws.getCell(headRow, i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  })

  const first = headRow + 1
  for (let i = 0; i < a.months; i++) {
    const row = first + i
    const rev = `B${row}`, cogs = `C${row}`, gp = `D${row}`, op = `E${row}`, oi = `F${row}`
    ws.getCell(`A${row}`).value = i + 1
    if (i === 0) {
      ws.getCell(rev).value = { formula: REV0 }
      ws.getCell(op).value = { formula: OPEX0 }
    } else {
      ws.getCell(rev).value = { formula: `B${row - 1}*(1+${GROWTH}/100)` }
      ws.getCell(op).value = { formula: `E${row - 1}*(1+${OPEXG}/100)` }
    }
    ws.getCell(gp).value = { formula: `${rev}*${GM}/100` }
    ws.getCell(cogs).value = { formula: `${rev}-${gp}` }
    ws.getCell(oi).value = { formula: `${gp}-${op}` }
    ;['B', 'C', 'D', 'E', 'F'].forEach((col) => { ws.getCell(`${col}${row}`).numFmt = USD })
  }

  const totalRow = first + a.months
  ws.getCell(`A${totalRow}`).value = 'Total'
  ws.getCell(`A${totalRow}`).font = { bold: true }
  ;['B', 'C', 'D', 'E', 'F'].forEach((col) => {
    const c = ws.getCell(`${col}${totalRow}`)
    c.value = { formula: `SUM(${col}${first}:${col}${totalRow - 1})` }
    c.numFmt = USD
    c.font = { bold: true }
  })

  const buf = await wb.xlsx.writeBuffer()
  return buf as unknown as ArrayBuffer
}
