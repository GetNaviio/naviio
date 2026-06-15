'use client'

import { useEffect } from 'react'
import { LEGAL_META, DocBody, type DocKey } from './legalData'

const FOOTER_LINKS: { key: DocKey; label: string }[] = [
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'terms', label: 'Terms & Conditions' },
  { key: 'contact', label: 'Contact' },
]

export default function LegalModal({
  doc,
  onClose,
  onNavigate,
}: {
  doc: DocKey
  onClose: () => void
  onNavigate: (doc: DocKey) => void
}) {
  const { title, meta, intro } = LEGAL_META[doc]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div style={S.backdrop} onClick={onClose}>
      <img src="/naviio-logo.png" alt="" aria-hidden style={S.wordmark} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={S.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={S.header}>
          <h2 style={S.title}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={S.close}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div style={S.body}>
          {meta && <p style={S.meta}>{meta}</p>}
          {intro && <p style={S.intro}>{intro}</p>}
          <DocBody doc={doc} />
        </div>
      </div>

      <footer style={S.footer} onClick={(e) => e.stopPropagation()}>
        <div style={S.footerLinks}>
          {FOOTER_LINKS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              style={{ ...S.footerLink, fontWeight: key === doc ? 600 : 400, color: key === doc ? '#94A3B8' : '#64748B' }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={S.copy}>© 2026 Naviio, Inc.</span>
      </footer>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'radial-gradient(ellipse 80% 70% at 50% 40%, rgba(19,28,61,0.85) 0%, rgba(10,14,26,0.92) 70%)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5.5rem 1.5rem 5rem',
    overflow: 'hidden',
    cursor: 'default',
    animation: 'naviioFade 0.2s ease',
  },
  wordmark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '120%',
    maxWidth: 'none',
    opacity: 0.04,
    filter: 'blur(1px)',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  modal: {
    position: 'relative',
    zIndex: 1,
    width: 'min(720px, 100%)',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0c1330',
    border: '1px solid #1E3055',
    borderRadius: 20,
    boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
    overflow: 'hidden',
    fontFamily: "'DM Sans', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.1rem 1.5rem',
    borderBottom: '1px solid #1E3055',
    flexShrink: 0,
  },
  title: { fontSize: '1.05rem', fontWeight: 700, color: '#F1F5F9', margin: 0 },
  close: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: '#94A3B8',
    cursor: 'pointer',
  },
  body: { overflowY: 'auto', padding: '1.75rem 1.75rem 2.25rem' },
  meta: { fontSize: 13, color: '#64748B', marginBottom: '1.25rem' },
  intro: { color: '#94A3B8', lineHeight: 1.7, marginBottom: '2rem' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem',
    padding: '1.25rem 2rem',
    zIndex: 2,
  },
  footerLinks: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' },
  footerLink: {
    fontSize: 13,
    color: '#64748B',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  copy: { fontSize: 13, color: '#64748B' },
}
