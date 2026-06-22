import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Trust & Security · Naviio',
  description:
    'How Naviio protects your financial data: encryption in transit and at rest, MFA, least-privilege access, audit logs, read-only bank access, and our SOC 2 roadmap.',
}

const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, marginTop: '2.25rem', marginBottom: '0.75rem', color: '#fff' }
const p: React.CSSProperties = { color: '#cbd5e1', fontSize: 15, lineHeight: 1.7, margin: '0 0 0.75rem' }
const li: React.CSSProperties = { color: '#cbd5e1', fontSize: 15, lineHeight: 1.7, marginBottom: '0.4rem' }
const tag: React.CSSProperties = {
  display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#3B82F6',
  background: 'rgba(59,130,246,0.12)', borderRadius: 999, padding: '2px 10px', marginBottom: '1rem',
}

export default function SecurityPage() {
  return (
    <article>
      <span style={tag}>Trust &amp; Security</span>
      <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 0.5rem' }}>
        Your financial data, protected.
      </h1>
      <p style={p}>
        Naviio ingests sensitive business financial data — bank transactions, revenue, and accounting
        records. Security isn&rsquo;t a feature here; it&rsquo;s the foundation. Here&rsquo;s exactly how we
        protect it.
      </p>

      <h2 style={h2}>Encryption</h2>
      <ul>
        <li style={li}><strong style={{ color: '#fff' }}>In transit</strong> — all traffic is served over TLS (HTTPS). Nothing moves in the clear.</li>
        <li style={li}><strong style={{ color: '#fff' }}>At rest</strong> — our database (Neon Postgres) encrypts all data at rest with AES-256. On top of that, stored bank and payment access tokens are wrapped in an additional application-layer AES-256-GCM envelope, so even a database leak never exposes usable provider credentials.</li>
      </ul>

      <h2 style={h2}>Authentication &amp; access</h2>
      <ul>
        <li style={li}><strong style={{ color: '#fff' }}>Multi-factor authentication</strong> — authenticator apps (TOTP) and passkeys (WebAuthn). MFA is required before any bank account can be connected.</li>
        <li style={li}><strong style={{ color: '#fff' }}>Least-privilege roles</strong> — team and advisor roles only get the access they need. A fractional-CFO advisor can review and categorize a client&rsquo;s financials but cannot touch billing, disconnect integrations, manage members, or delete the organization.</li>
        <li style={li}><strong style={{ color: '#fff' }}>Client-owned access</strong> — clients always own their own login. A firm works on a client&rsquo;s books only after the client explicitly grants access, and that grant is recorded.</li>
      </ul>

      <h2 style={h2}>Bank connections are read-only</h2>
      <p style={p}>
        Bank data is connected through <strong style={{ color: '#fff' }}>Plaid</strong>, a bank-grade
        aggregator trusted by thousands of fintechs. Access is <strong style={{ color: '#fff' }}>read-only</strong> —
        Naviio can see transactions and balances to build your P&amp;L, cash flow, and runway, but can never
        move money. Your banking credentials are entered with Plaid and are never shared with or stored by Naviio.
      </p>

      <h2 style={h2}>Audit logs &amp; data retention</h2>
      <ul>
        <li style={li}><strong style={{ color: '#fff' }}>Audit logs</strong> — access to client organizations is logged: who, what, and when.</li>
        <li style={li}><strong style={{ color: '#fff' }}>Retention &amp; deletion</strong> — you can delete your account and data at any time. Deletion disables access immediately and purges data after a short grace window via an automated nightly job.</li>
        <li style={li}><strong style={{ color: '#fff' }}>Token revocation</strong> — disconnecting an integration revokes and clears its tokens; signing out denylists the session.</li>
      </ul>

      <h2 style={h2}>AI governance</h2>
      <p style={p}>
        Naviio&rsquo;s numbers are computed deterministically from your ledger — we don&rsquo;t fabricate
        figures. Where Navi offers AI-generated narrative or suggestions, it carries a clear notice:
        <em style={{ color: '#fff' }}> AI-generated insights are informational and should be reviewed by a qualified financial professional.</em>
      </p>

      <h2 style={h2}>SOC 2 roadmap</h2>
      <p style={p}>
        We&rsquo;re pursuing SOC 2 — the standard CFO firms ask for. Our controls (encryption, MFA,
        least-privilege access, audit logging, retention) are already in place; we&rsquo;re formalizing the
        evidence and audit:
      </p>
      <ul>
        <li style={li}><strong style={{ color: '#fff' }}>SOC 2 Type I</strong> — controls designed correctly (in progress).</li>
        <li style={li}><strong style={{ color: '#fff' }}>SOC 2 Type II</strong> — controls operating effectively over time (to follow).</li>
      </ul>
      <p style={{ ...p, marginTop: '0.5rem' }}>
        Evaluating Naviio for your firm and need our security details or a subprocessor list?
        Email <a href="mailto:security@naviio.com" style={{ color: '#3B82F6' }}>security@naviio.com</a>.
      </p>
    </article>
  )
}
