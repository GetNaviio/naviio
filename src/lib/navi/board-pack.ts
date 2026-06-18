/**
 * Board-pack generator — a print-ready, self-contained HTML financial summary
 * the user can save as PDF (browser Print → Save as PDF). No headless-browser or
 * PDF dependency: the route returns this HTML, the browser does the PDF.
 *
 * Every figure comes from the metric engine (cash basis) — never invented.
 */
import { prisma } from '@/lib/prisma'
import { loadPrimaryLedger, startOfYearUTC, monthsAgoUTC, connectedProviders, categoryOverrides } from '@/lib/metrics/ledger'
import { incomeStatement, cashFlow, runwayMonths } from '@/lib/metrics/compute'
import { getCashBalance } from '@/lib/integrations/plaid'
import { getStripeMetrics } from '@/lib/integrations/stripe'

const usd = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function buildBoardPackHtml(orgId: string): Promise<string> {
  const [org, ledger, overrides, providers] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    loadPrimaryLedger(orgId, monthsAgoUTC(12)),
    categoryOverrides(orgId),
    connectedProviders(orgId),
  ])
  const is = incomeStatement(ledger, startOfYearUTC(), undefined, overrides)
  const cf = cashFlow(ledger)
  const cash = providers.has('PLAID') ? await getCashBalance(orgId).catch(() => null) : null
  const runway = cash != null && cf.burnRate > 0 ? runwayMonths(cash, cf.burnRate) : null
  const stripe = providers.has('STRIPE') ? await getStripeMetrics(orgId).catch(() => null) : null

  const name = esc(org?.name ?? 'Your company')
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const card = (label: string, value: string) =>
    `<div class="card"><div class="lbl">${label}</div><div class="val">${value}</div></div>`

  const kpis = [
    card('Cash balance', usd(cash)),
    card('Net burn / mo', cf.burnRate > 0 ? usd(cf.burnRate) : 'Cash positive'),
    card('Runway', runway == null ? '∞' : `${runway} mo`),
    card('Net income (YTD)', usd(is.netIncome)),
    ...(stripe ? [card('MRR', usd(stripe.mrr)), card('Active customers', String(stripe.customers?.total ?? '—'))] : []),
  ].join('')

  const expenseRows = is.expensesByCategory
    .slice(0, 10)
    .map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${usd(c.amount)}</td></tr>`)
    .join('') || '<tr><td colspan="2" class="muted">No categorized expenses yet.</td></tr>'

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — Board Pack</title>
<style>
  :root { --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --accent:#2F6BFF; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 40px; background: #fff; }
  .wrap { max-width: 820px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--ink); padding-bottom: 12px; margin-bottom: 8px; }
  h1 { font-size: 22px; margin: 0; } .sub { color: var(--muted); font-size: 13px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 28px 0 10px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .card { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
  .lbl { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .val { font-size: 20px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 4px; border-bottom: 1px solid var(--line); }
  .num { text-align: right; font-variant-numeric: tabular-nums; } .muted { color: var(--muted); }
  .statement td:first-child { color: var(--muted); } .statement .total td { font-weight: 700; color: var(--ink); border-top: 2px solid var(--ink); }
  .foot { margin-top: 32px; color: var(--muted); font-size: 11px; }
  .print { margin: 20px 0; }
  .print button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; cursor: pointer; }
  @media print { .print { display: none; } body { padding: 0; } }
</style></head>
<body><div class="wrap">
  <header><div><h1>${name}</h1><div class="sub">Board financial pack · cash basis</div></div><div class="sub">${today}</div></header>

  <div class="print"><button onclick="window.print()">Save as PDF</button></div>

  <h2>Key metrics</h2>
  <div class="grid">${kpis}</div>

  <h2>Profit &amp; loss — year to date</h2>
  <table class="statement">
    <tr><td>Total income</td><td class="num">${usd(is.totalIncome)}</td></tr>
    <tr><td>Total expenses</td><td class="num">(${usd(is.totalExpenses)})</td></tr>
    <tr class="total"><td>Net income</td><td class="num">${usd(is.netIncome)}</td></tr>
    <tr><td>Net margin</td><td class="num">${is.netMargin != null ? `${is.netMargin.toFixed(1)}%` : '—'}</td></tr>
  </table>

  <h2>Top expenses by category (YTD)</h2>
  <table>${expenseRows}</table>

  <div class="foot">Cash basis — revenue recognized when received, expenses when paid; excludes A/R, A/P, deferred revenue, depreciation, and loan interest. Generated by Naviio from connected accounts (${[...providers].map((p) => esc(p)).join(', ') || 'none'}). Not a GAAP statement or tax advice.</div>
</div></body></html>`
}
