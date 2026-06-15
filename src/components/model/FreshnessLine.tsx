'use client'

/**
 * The trust badge: tells the user how current the actuals are and that the
 * in-progress month is partial. Numbers without provenance get distrusted the
 * first time they disagree with the bank — this line is why ours won't be.
 */
export interface MonthlyMeta {
  currentMonth: string
  currentMonthIsPartial: boolean
  sources: { provider: string; lastSyncedAt: string | null }[]
  generatedAt: string
}

const PROVIDER_LABEL: Record<string, string> = {
  PLAID: 'Bank',
  STRIPE: 'Stripe',
  QUICKBOOKS: 'QuickBooks',
  XERO: 'Xero',
  GUSTO: 'Gusto',
  ADP: 'ADP',
  SHOPIFY: 'Shopify',
  GOHIGHLEVEL: 'GoHighLevel',
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
}

function relative(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function FreshnessLine({ meta }: { meta?: MonthlyMeta | null }) {
  if (!meta) return null
  const synced = meta.sources.filter((s) => s.lastSyncedAt)
  // Oldest sync is the honest freshness bound — the data is only as fresh as
  // its stalest source.
  const oldest = synced.reduce<string | null>(
    (acc, s) => (acc == null || (s.lastSyncedAt as string) < acc ? s.lastSyncedAt : acc),
    null,
  )
  const stale = oldest != null && Date.now() - new Date(oldest).getTime() > 48 * 3600_000

  return (
    <p className="mb-2 text-xs" style={{ color: stale ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
      Actuals from {synced.length ? synced.map((s) => PROVIDER_LABEL[s.provider] ?? s.provider).join(' + ') : 'no connected sources'}
      {oldest && <> · synced {relative(oldest)}</>}
      {stale && ' — data may be out of date'}
      {' · '}current month is in progress (MTD)
    </p>
  )
}
