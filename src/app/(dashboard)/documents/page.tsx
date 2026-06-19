'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { FolderOpen, FileText, ExternalLink, Trash2, Plus, FolderInput, RefreshCw } from 'lucide-react'

interface Ref {
  id: string
  name: string
  path: string | null
  sizeBytes: number | null
  modifiedAt: string | null
}
interface BrowseEntry {
  externalId: string
  name: string
  path: string
  sizeBytes: number | null
  modifiedAt: string | null
  isFolder: boolean
}

function fmtSize(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentsInner() {
  const params = useSearchParams()
  const [configured, setConfigured] = useState(true)
  const [connected, setConnected] = useState(false)
  const [accountLabel, setAccountLabel] = useState<string | null>(null)
  const [refs, setRefs] = useState<Ref[]>([])
  const [loading, setLoading] = useState(true)

  const [browsing, setBrowsing] = useState(false)
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setConfigured(data.configured)
      setConnected(data.connected)
      setAccountLabel(data.accountLabel)
      setRefs(data.refs ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const s = params.get('success')
    const e = params.get('error')
    if (s === 'dropbox') setNotice('Dropbox connected.')
    else if (e) setNotice(e === 'dropbox_not_configured' ? 'Dropbox is not configured on this server.' : 'Could not connect Dropbox.')
  }, [load, params])

  async function browse(p = '') {
    setBrowsing(true)
    setPath(p)
    const res = await fetch(`/api/documents?browse=1&path=${encodeURIComponent(p)}`)
    const data = await res.json()
    setEntries(res.ok ? data.entries ?? [] : [])
  }

  async function share(e: BrowseEntry) {
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        externalId: e.externalId,
        name: e.name,
        path: e.path,
        sizeBytes: e.sizeBytes,
        modifiedAt: e.modifiedAt,
      }),
    })
    load()
  }

  async function open(id: string) {
    const res = await fetch(`/api/documents?open=${id}`)
    const data = await res.json()
    if (res.ok && data.url) window.open(data.url, '_blank', 'noopener')
  }

  async function unshare(id: string) {
    await fetch('/api/documents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  async function disconnect() {
    await fetch('/api/documents/disconnect', { method: 'POST' })
    setBrowsing(false)
    load()
  }

  const card = { backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-surface-bg)' }}>
      <Header />
      <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <FolderOpen size={22} style={{ color: 'var(--color-info)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Documents</h1>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Share files between you and {accountLabel ? 'your client' : 'your CFO'} via Dropbox. Files stay in Dropbox —
          Naviio only keeps a link, never a copy.
        </p>

        {notice && (
          <div className="rounded-lg border px-3 py-2 mb-4 text-sm" style={{ ...card, color: 'var(--color-text-primary)' }}>
            {notice}
          </div>
        )}

        {!configured ? (
          <div className="rounded-xl border p-6 text-center" style={card}>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Document sharing isn&rsquo;t configured on this server yet (missing Dropbox app keys).
            </p>
          </div>
        ) : !connected ? (
          <div className="rounded-xl border p-6 text-center" style={card}>
            <FolderInput size={26} className="mx-auto mb-3" style={{ color: 'var(--color-info)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              Connect Dropbox to share statements, tax docs, and working files. Read-only access — Naviio never stores
              the files themselves.
            </p>
            <a href="/api/auth/dropbox" className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-info)' }}>
              Connect Dropbox
            </a>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Connected{accountLabel ? ` as ${accountLabel}` : ''}
              </p>
              <div className="flex gap-2">
                <button onClick={() => browse('')} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--color-info)' }}>
                  <Plus size={14} /> Share a file
                </button>
                <button onClick={disconnect} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-text-secondary)' }}>
                  Disconnect
                </button>
              </div>
            </div>

            {/* Browse picker */}
            {browsing && (
              <div className="rounded-xl border p-4 mb-5" style={card}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Dropbox{path ? `: ${path}` : ' (root)'}
                  </p>
                  <button onClick={() => browse(path)} className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {entries.length === 0 && <p className="text-xs py-2" style={{ color: 'var(--color-text-secondary)' }}>Empty folder.</p>}
                  {entries.map((e) => (
                    <div key={e.externalId} className="flex items-center justify-between py-1.5 px-2 rounded" style={{ backgroundColor: 'var(--color-surface-bg)' }}>
                      <button
                        onClick={() => e.isFolder && browse(e.path)}
                        className="flex items-center gap-2 text-sm min-w-0 text-left"
                        style={{ color: 'var(--color-text-primary)', cursor: e.isFolder ? 'pointer' : 'default' }}
                      >
                        {e.isFolder ? <FolderOpen size={14} /> : <FileText size={14} />}
                        <span className="truncate">{e.name}</span>
                      </button>
                      {!e.isFolder && (
                        <button onClick={() => share(e)} className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-info)' }}>
                          Share
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shared list */}
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Shared files</h2>
            {loading ? (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
            ) : refs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No files shared yet.</p>
            ) : (
              <div className="space-y-2">
                {refs.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 flex items-center justify-between" style={card}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={15} style={{ color: 'var(--color-text-secondary)' }} />
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{r.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{fmtSize(r.sizeBytes)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => open(r.id)} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded font-medium" style={{ backgroundColor: 'var(--color-surface-card-hover)', color: 'var(--color-info)' }}>
                        <ExternalLink size={13} /> Open
                      </button>
                      <button onClick={() => unshare(r.id)} className="p-1.5 rounded" style={{ color: 'var(--color-text-secondary)' }} aria-label="Unshare">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <DocumentsInner />
    </Suspense>
  )
}
