'use client'

/**
 * Public client portal — the read-only view a client opens from a shared link.
 * No app chrome, no login, no navigation into the product. Just the headline
 * financials the CFO chose to share, branded, with an honest "as of" stamp.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, TrendingUp, Wallet, Target, ShieldCheck } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Snapshot {
  orgName: string
  branding: { logoUrl: string | null; color: string | null; hideNaviioBranding: boolean }
  scopes: string[]
  pnl?: { totalIncome: number; totalExpenses: number; netIncome: number; netMargin: number | null }
  cash?: { balance: number | null; netCashFlow: number; burnRate: number; runwayMonths: number | null }
  kpis?: { grossMargin: number | null; monthlyBurn: number; ytdRevenue: number; ytdNet: number }
  generatedAt: string
}

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: accent ?? 'var(--color-text-primary)' }}>{value}</p>
    </div>
  )
}

function Section({ icon: Icon, title, accent, children }: { icon: typeof TrendingUp; title: string; accent: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        <Icon size={15} style={{ color: accent }} /> {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </section>
  )
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/portal/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSnap)
      .catch(() => setFailed(true))
  }, [token])

  // White-label: client's brand color drives accents; their logo replaces
  // Naviio's in the header. Falls back to Naviio blue / logo when unbranded.
  const accent = (snap?.branding?.color && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(snap.branding.color))
    ? snap.branding.color
    : '#3B82F6'
  const logoUrl = snap?.branding?.logoUrl
  const hideNaviio = !!snap?.branding?.hideNaviioBranding

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#060D1F' }}>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        {/* Brand header — client logo when white-labeled, else Naviio */}
        <div className="flex items-center justify-between mb-8">
          {logoUrl
            ? <img src={logoUrl} alt={snap?.orgName ?? 'Logo'} className="h-9 w-auto max-w-[200px] object-contain" />
            : <img src="/naviio-logo.png" alt="Naviio" className="h-9 w-auto" />}
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <ShieldCheck size={13} style={{ color: '#10B981' }} /> Read-only shared view
          </span>
        </div>

        {failed ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
            <h1 className="text-lg font-semibold text-white">This link is no longer available</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              It may have been revoked or expired. Ask whoever shared it for a new link.
            </p>
          </div>
        ) : !snap ? (
          <p className="flex items-center gap-2 text-sm py-10 justify-center" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 size={15} className="animate-spin" /> Loading the latest figures…
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white">{snap.orgName}</h1>
            <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
              Financial summary · as of {new Date(snap.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>

            <div className="space-y-8">
              {snap.pnl && (
                <Section icon={TrendingUp} title="Profit & Loss (year to date)" accent={accent}>
                  <Stat label="Revenue" value={formatCurrency(snap.pnl.totalIncome)} />
                  <Stat label="Expenses" value={formatCurrency(snap.pnl.totalExpenses)} />
                  <Stat label="Net income" value={formatCurrency(snap.pnl.netIncome)} accent={snap.pnl.netIncome >= 0 ? '#10B981' : '#EF4444'} />
                  <Stat label="Net margin" value={pct(snap.pnl.netMargin)} />
                </Section>
              )}

              {snap.cash && (
                <Section icon={Wallet} title="Cash" accent={accent}>
                  <Stat label="Cash on hand" value={snap.cash.balance != null ? formatCurrency(snap.cash.balance) : '—'} />
                  <Stat label="Net cash flow" value={formatCurrency(snap.cash.netCashFlow)} accent={snap.cash.netCashFlow >= 0 ? '#10B981' : '#EF4444'} />
                  <Stat label="Monthly burn" value={snap.cash.burnRate > 0 ? formatCurrency(snap.cash.burnRate) : 'Cash positive'} />
                  {snap.cash.runwayMonths != null && (
                    <Stat label="Runway" value={`${snap.cash.runwayMonths.toFixed(1)} mo`} />
                  )}
                </Section>
              )}

              {snap.kpis && (
                <Section icon={Target} title="Key metrics" accent={accent}>
                  <Stat label="YTD revenue" value={formatCurrency(snap.kpis.ytdRevenue)} />
                  <Stat label="YTD net" value={formatCurrency(snap.kpis.ytdNet)} accent={snap.kpis.ytdNet >= 0 ? '#10B981' : '#EF4444'} />
                  <Stat label="Net margin" value={pct(snap.kpis.grossMargin)} />
                  <Stat label="Monthly burn" value={snap.kpis.monthlyBurn > 0 ? formatCurrency(snap.kpis.monthlyBurn) : 'Cash positive'} />
                </Section>
              )}
            </div>

            <p className="text-xs text-center mt-10" style={{ color: 'var(--color-text-muted)' }}>
              {hideNaviio ? 'Figures are computed live from connected accounts' : 'Powered by Navi · figures are computed live from connected accounts'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
