'use client'

/**
 * White-label branding manager (CFO Suite). Owner of a CFO-plan org sets a
 * logo URL + accent color shown on the client portal (and exported reports),
 * and can hide the "Powered by Navi" mark. Live preview so they see the
 * client-facing result before saving. Renders a soft upsell for non-CFO orgs,
 * nothing for non-owners.
 */
import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { Loader2, CheckCircle, ShieldCheck, Upload } from 'lucide-react'

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Native <input type="color"> only accepts #RRGGBB — expand the 3-digit form. */
function toSixHex(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [r, g, b] = hex.slice(1)
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return hex
}

export default function BrandingSection() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'locked' | 'hidden' | 'error'>('loading')
  const [logoUrl, setLogoUrl] = useState('')
  const [color, setColor] = useState('')
  const [hideNaviio, setHideNaviio] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function uploadLogo(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/org/branding/logo', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Upload failed'); return }
      // Upload already persisted brandLogoUrl server-side; reflect it locally.
      setLogoUrl(data.logoUrl)
    } catch { setError('Upload failed — please try again') }
    finally { setUploading(false) }
  }

  useEffect(() => {
    fetch('/api/org/branding')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setLogoUrl(d.branding?.logoUrl ?? '')
        setColor(d.branding?.color ?? '')
        setHideNaviio(!!d.branding?.hideNaviioBranding)
        // canEdit = owner AND CFO plan. Owners on a lesser plan see the upsell;
        // members see nothing.
        setStatus(d.canEdit ? 'ready' : d.plan ? 'locked' : 'hidden')
      })
      .catch(() => setStatus('error'))
  }, [])

  async function save() {
    setBusy(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/org/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: logoUrl.trim() || null, color: color.trim() || null, hideNaviioBranding: hideNaviio }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not save branding'); return }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch { setError('Network error — please try again') }
    finally { setBusy(false) }
  }

  if (status === 'hidden') return null // members don't see branding

  if (status === 'error') {
    return (
      <Card title="White-label" subtitle="Your client's brand on their portal and exported reports">
        <p className="text-sm" style={{ color: '#F59E0B' }}>
          Couldn&apos;t load branding. If you just updated the app, run the pending database
          migration and restart the server, then refresh.
        </p>
      </Card>
    )
  }

  if (status === 'locked') {
    return (
      <Card title="White-label" subtitle="Put your client's brand on their portal and reports">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Custom logos and colors on the client portal are a{' '}
          <span className="font-semibold" style={{ color: '#3B82F6' }}>CFO Suite</span> feature.
        </p>
      </Card>
    )
  }

  const validColor = color === '' || HEX_RE.test(color)
  const accent = validColor && color ? color : '#3B82F6'

  return (
    <Card
      title="White-label"
      subtitle="Your client's brand on their portal and exported reports"
      tooltip="Shown on the public client-portal page. The logo must be a hosted https image URL; the accent color is a hex value. These apply to this organization only — brand each client entity separately."
    >
      {status === 'loading' ? (
        <p className="flex items-center gap-2 text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Loading branding…
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Client logo</label>
            <div className="flex items-center gap-3">
              {logoUrl.trim() && (
                <img src={logoUrl.trim()} alt="Current logo" className="h-9 w-auto max-w-[120px] object-contain rounded"
                  style={{ backgroundColor: 'var(--color-surface-input)' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />
              )}
              <label className="cursor-pointer px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors hover:bg-white/5"
                style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : logoUrl.trim() ? 'Replace logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }}
                />
              </label>
              {logoUrl.trim() && (
                <button type="button" onClick={() => setLogoUrl('')}
                  className="text-xs transition-colors hover:underline" style={{ color: 'var(--color-text-muted)' }}>
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
              PNG, JPEG, or WebP up to 2 MB.
            </p>

            {/* Advanced: paste a hosted URL instead of uploading. */}
            <details className="mt-2">
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Or paste a logo URL</summary>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://acme.com/logo.png"
                className="w-full mt-1.5 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--color-surface-input)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}
              />
            </details>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Accent color (hex)</label>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#2563EB"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--color-surface-input)', border: `1px solid ${validColor ? 'var(--color-surface-border)' : '#EF4444'}`, color: 'var(--color-text-primary)' }}
              />
            </div>
            {/* Native color picker — click the swatch to open the OS palette.
                Kept in sync with the hex field; writes back an uppercase #RRGGBB. */}
            <label className="mt-5 flex-shrink-0 cursor-pointer" title="Pick a color">
              <span className="block w-9 h-9 rounded-lg" style={{ backgroundColor: accent, border: '1px solid var(--color-surface-border)' }} aria-hidden="true" />
              <input
                type="color"
                value={HEX_RE.test(accent) ? toSixHex(accent) : '#3B82F6'}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="sr-only"
                aria-label="Accent color picker"
              />
            </label>
          </div>

          <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={hideNaviio} onChange={(e) => setHideNaviio(e.target.checked)} />
            Hide “Powered by Navi” on the client portal
          </label>

          {/* Live preview of the portal header */}
          <div className="rounded-xl p-4" style={{ backgroundColor: '#060D1F', border: '1px solid var(--color-surface-border)' }}>
            <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Client portal preview</p>
            <div className="flex items-center justify-between">
              {logoUrl.trim()
                ? <img src={logoUrl.trim()} alt="Logo preview" className="h-7 w-auto max-w-[160px] object-contain"
                    onError={(e) => { (e.currentTarget.style.display = 'none') }} />
                : <span className="text-sm font-bold text-white">Your logo</span>}
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <ShieldCheck size={12} style={{ color: '#10B981' }} /> Read-only
              </span>
            </div>
            <p className="text-lg font-bold mt-3" style={{ color: accent }}>Net income</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>accent color applied to section highlights</p>
          </div>

          {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
          <button
            onClick={save}
            disabled={busy || !validColor}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            style={{ backgroundColor: saved ? '#10B981' : '#3B82F6', color: '#fff' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : null}
            {saved ? 'Saved' : 'Save branding'}
          </button>
        </div>
      )}
    </Card>
  )
}
