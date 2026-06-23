'use client'

import { useCallback, type ReactNode } from 'react'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import MetricCard from '@/components/ui/MetricCard'
import MobileHero from '@/components/dashboard/MobileHero'
import ConnectPrompt from '@/components/ConnectPrompt'
import { SkeletonGrid, ErrorState } from '@/components/ui/PageState'
import { usePageData, fetchJson } from '@/hooks/usePageData'
import InfoTip from '@/components/ui/InfoTip'
import { formatCurrency } from '@/lib/utils'
import { cac as calcCac, magicNumber } from '@/lib/metrics/marketing'
import { Target, BarChart3, Percent, Lock, Megaphone, Zap } from 'lucide-react'
import type { StripeMetrics } from '@/lib/integrations/stripe'

interface Metrics {
  sources: { plaid: boolean; stripe: boolean; quickbooks: boolean; xero: boolean }
  incomeStatement: { totalIncome: number; netIncome: number; netMargin: number | null; cogs: number; grossMargin: number | null }
  marketing?: { thisMonth: number }
}
interface Movement { waterfall: { netNewMrr: number } | null }

// KPIs still needing data we don't capture yet — listed honestly, never faked.
const LOCKED_BASE = [
  { name: 'Payback Period', need: 'CAC + gross margin' },
  { name: 'Rule of 40', need: 'YoY growth + EBITDA margin' },
  { name: 'Burn Multiple', need: 'Net-new ARR + burn history' },
  { name: 'Gross Margin', need: 'COGS classification (accounting)' },
]

export default function KPIsPage() {
  const { data, loading, error, refetch } = usePageData(
    useCallback(async (signal: AbortSignal) => {
      const [metrics, sm, move] = await Promise.all([
        fetchJson<Metrics>('/api/metrics', signal), // required — drives the page
        // Optional enrichments: soft-fail to null, page renders without them.
        fetchJson<{ source?: string; metrics?: StripeMetrics }>('/api/stripe/metrics', signal).catch(() => null),
        fetchJson<Movement>('/api/revenue/movement', signal).catch(() => null),
      ])
      return {
        m: metrics,
        stripe: sm?.source === 'stripe' && sm.metrics ? sm.metrics : null,
        mv: move,
      }
    }, []),
  )
  const m = data?.m ?? null
  const stripe = data?.stripe ?? null
  const mv = data?.mv ?? null

  const anyConnected = !!(m?.sources && (m.sources.plaid || m.sources.stripe || m.sources.quickbooks || m.sources.xero))
  const is = m?.incomeStatement

  // KPIs is the EFFICIENCY / unit-economics layer. Recurring-revenue counters
  // (MRR, customers, churn, LTV) live on the Revenue tab — not duplicated here.
  const cards: { title: string; value: string; suffix?: string; subtitle?: string; icon: ReactNode; iconBg: string; tooltip: string }[] = []
  // Gross margin — the keystone unit-economic, universal to every industry. Shown
  // only when a real cost-of-revenue split exists (cogs > 0); otherwise gross
  // margin would be a misleading 100%.
  const grossShown = is?.grossMargin != null && (is?.cogs ?? 0) > 0
  if (grossShown)
    cards.push({ title: 'Gross Margin', value: is!.grossMargin!.toFixed(1), suffix: '%', icon: <Percent size={16} style={{ color: '#8B5CF6' }} />, iconBg: 'rgba(139,92,246,0.15)', tooltip: 'Gross profit ÷ revenue, year-to-date — revenue minus cost of revenue (COGS), from your ledger.' })
  if (is?.netMargin != null)
    cards.push({ title: 'Net Margin', value: is.netMargin.toFixed(1), suffix: '%', icon: <Percent size={16} style={{ color: '#14B8A6' }} />, iconBg: 'rgba(20,184,166,0.15)', tooltip: 'Net income ÷ total income, year-to-date — from your transaction ledger.' })

  // CAC / LTV-CAC / Magic Number — unlocked by ad-spend tagging + MRR snapshots.
  const marketing = m?.marketing?.thisMonth ?? 0
  const newCust = stripe?.customers?.newThisMonth ?? 0
  const cacVal = marketing > 0 ? calcCac(marketing, newCust) : null
  const ltvCac = cacVal && stripe?.ltv != null && cacVal > 0 ? stripe.ltv / cacVal : null
  const netNewArr = mv?.waterfall ? mv.waterfall.netNewMrr * 12 : null
  const magic = netNewArr != null && marketing > 0 ? magicNumber(netNewArr, marketing) : null

  if (cacVal != null)
    cards.push({ title: 'CAC', value: formatCurrency(cacVal, true), subtitle: `${formatCurrency(marketing, true)} S&M ÷ ${newCust}`, icon: <Megaphone size={16} style={{ color: '#F59E0B' }} />, iconBg: 'rgba(245,158,11,0.15)', tooltip: 'Customer Acquisition Cost — tagged ad spend this month ÷ new customers.' })
  if (ltvCac != null)
    cards.push({ title: 'LTV / CAC', value: `${ltvCac.toFixed(1)}`, suffix: 'x', icon: <BarChart3 size={16} style={{ color: '#3B82F6' }} />, iconBg: 'rgba(59,130,246,0.15)', tooltip: 'Lifetime value ÷ acquisition cost. >3x viable, >5x excellent.' })
  if (magic != null)
    cards.push({ title: 'Magic Number', value: `${magic.toFixed(2)}`, suffix: 'x', icon: <Zap size={16} style={{ color: '#10B981' }} />, iconBg: 'rgba(16,185,129,0.15)', tooltip: 'Net-new ARR ÷ S&M spend. >1.0 means efficient growth.' })

  // Build the "still locked" list — drop anything we just computed live.
  const LOCKED = [
    ...(mv?.waterfall ? [] : [{ name: 'NRR', need: 'A second monthly MRR snapshot' }]),
    ...(cacVal != null ? [] : [{ name: 'CAC', need: 'Tagged ad spend + new customers' }]),
    ...(magic != null ? [] : [{ name: 'Magic Number', need: 'Net-new ARR + ad spend' }]),
    ...LOCKED_BASE.filter((x) => !(grossShown && x.name === 'Gross Margin')),
  ]

  return (
    <div>
      <Header title="KPI Dashboard" subtitle="The unit-economics and efficiency metrics computed from your live data" />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState message="We couldn't load your KPIs." onRetry={refetch} />
        ) : !anyConnected ? (
          <ConnectPrompt
            icon={<Target size={20} />}
            title="Connect your tools to see KPIs"
            message="KPIs are the efficiency metrics computed from your live data — net margin from your ledger, and CAC / LTV-CAC / Magic Number once ad spend is tagged. (MRR, customers and churn live on the Revenue tab.)"
            cta="Connect an integration"
          />
        ) : (
          <>
            {cards.length > 0 ? (
              <>
                {/* Mobile: lead KPI as hero + next three as chips. Desktop keeps the grid. */}
                <MobileHero
                  label={cards[0].title}
                  value={`${cards[0].value}${cards[0].suffix ?? ''}`}
                  sub={cards[0].subtitle}
                  chips={cards.slice(1, 4).map((c) => ({ label: c.title, value: `${c.value}${c.suffix ?? ''}` }))}
                />
                <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {cards.map((c) => <MetricCard key={c.title} title={c.title} value={c.value} suffix={c.suffix} subtitle={c.subtitle} icon={c.icon} iconBg={c.iconBg} tooltip={c.tooltip} />)}
                </div>
              </>
            ) : (
              <Card title="KPIs">
                <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No efficiency inputs yet — your net margin populates as transactions sync, and tagging ad spend unlocks CAC, LTV/CAC and Magic Number.</p>
              </Card>
            )}

            <Card title="Advanced KPIs" subtitle="Unlocked as more data connects" tooltip="These metrics need data sources we don't capture yet. They'll populate automatically once the inputs are available — no demo values are shown.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                {LOCKED.map(({ name, need }) => (
                  <div key={name} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
                    <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      <Lock size={12} style={{ color: 'var(--color-text-muted)' }} />
                      {name}
                      <InfoTip text={`Needs: ${need}.`} />
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>needs {need.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
