import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Standalone legal pages (/privacy, /terms, /data-deletion) — same content as
 * the landing-page modals, but at real URLs. Meta and Google app settings
 * require publicly accessible Privacy Policy and Data Deletion URLs.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#fff', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        <Link href="/" style={{ color: '#3B82F6', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          ← Naviio
        </Link>
        <main style={{ marginTop: '2rem' }}>{children}</main>
        <footer style={{ marginTop: '4rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#64748B', fontSize: 13 }}>
          © 2026 Naviio, Inc. · <Link href="/privacy" style={{ color: '#64748B' }}>Privacy</Link> · <Link href="/terms" style={{ color: '#64748B' }}>Terms</Link> · <Link href="/data-deletion" style={{ color: '#64748B' }}>Data deletion</Link>
        </footer>
      </div>
    </div>
  )
}
