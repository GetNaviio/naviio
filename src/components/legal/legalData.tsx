import type { ReactNode } from 'react'

export type DocKey = 'privacy' | 'terms' | 'contact'

type Section = { title: string; body: string }

export const LEGAL_META: Record<DocKey, { title: string; meta?: string; intro: string }> = {
  privacy: {
    title: 'Privacy Policy',
    meta: 'Last updated: June 6, 2026',
    intro:
      'Naviio, Inc. ("Naviio," "we," "us") operates the Naviio financial intelligence platform. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.',
  },
  terms: {
    title: 'Terms of Service',
    meta: 'Last updated: June 8, 2026',
    intro:
      'These Terms of Service ("Terms") govern your access to and use of the Naviio financial intelligence platform operated by Naviio, Inc. ("Naviio," "we," "us"). By creating an account or using the service, you agree to these Terms. If you do not agree, do not use the service.',
  },
  contact: {
    title: 'Contact',
    intro:
      "We'd love to hear from you. Reach the right team directly using the address below — we typically reply within one business day.",
  },
}

export const PRIVACY_SECTIONS: Section[] = [
  {
    title: '1. Information We Collect',
    body: `We collect information you provide directly and data retrieved through integrations you authorize:

**Account data:** Email address, name, and hashed password when you register.

**Financial data (via connected integrations):**
- Bank transactions, account balances, and account metadata via Plaid
- Profit & loss, balance sheet, and expense data via QuickBooks or Xero
- Revenue, MRR/ARR, and subscription metrics via Stripe
- Payroll totals via Gusto or ADP
- Advertising performance metrics (spend, impressions, clicks, conversions) via Meta Ads or Google Ads, used solely to reconcile your ad charges and display your own campaign performance

**Usage data:** Pages visited, features used, and error logs for improving the product.

We do not collect full bank account numbers, routing numbers, credit card numbers, or online banking credentials. Plaid handles all bank authentication — we never see your bank username or password.`,
  },
  {
    title: '2. How We Use Your Information',
    body: `We use your data exclusively to provide the Naviio service:

- Displaying your financial dashboard, reports, and forecasts
- Generating AI-powered insights and alerts
- Authenticating your account and maintaining your session
- Sending transactional emails (account confirmations, alert notifications)
- Improving product reliability and fixing errors

We do not sell your data. We do not use your financial data for advertising, credit decisioning, or any purpose other than providing you the Naviio service.`,
  },
  {
    title: '3. Data Sharing',
    body: `We share data only with the following service providers, strictly as needed to operate the platform:

- **AWS** — cloud infrastructure and database hosting
- **Plaid** — bank data aggregation (governed by Plaid's Privacy Policy)
- **Anthropic** — AI analysis (receives aggregated financial summaries only; no raw transactions or PII)
- **SendGrid** — transactional email delivery
- **Vercel** — application hosting

We do not share your financial data with other customers, data brokers, advertisers, or any third party not listed above. All vendors are contractually bound to use your data only to provide their service to Naviio.`,
  },
  {
    title: '4. Data Security',
    body: `We implement industry-standard security measures to protect your data:

- All data is encrypted at rest using AES-256 via AWS KMS
- All data in transit is encrypted using TLS 1.2 or higher
- OAuth tokens are encrypted at the application layer before storage
- Multi-factor authentication is required for all access to production systems
- Access to customer data is limited to named personnel with a documented business need

No method of transmission or storage is 100% secure. If you believe your account has been compromised, contact us immediately at hello@naviio.com.`,
  },
  {
    title: '5. Data Retention',
    body: `We retain your financial data for up to 25 months from the date of collection to enable historical analysis. Authentication logs are retained for 90 days. When you delete your account, we permanently delete all your financial data within 30 days and revoke all connected integration tokens immediately.

You may request deletion of your data at any time. See Section 7 for how to exercise this right.`,
  },
  {
    title: '6. Plaid-Specific Disclosures',
    body: `Naviio uses Plaid to connect to your bank accounts. By connecting a bank account, you agree to Plaid's End User Privacy Policy (plaid.com/legal/end-user-privacy-policy/).

Plaid data accessed through our platform is:
- Used only to display your financial information back to you
- Never shared with other customers or third parties for marketing or analytics
- Revoked via Plaid's API immediately upon disconnection or account deletion
- Stored in compliance with Plaid's Developer Policy`,
  },
  {
    title: '7. Your Rights',
    body: `You have the right to:

- **Access** your personal data by logging into your account or emailing hello@naviio.com
- **Correct** inaccurate data through your account settings
- **Delete** your account and all associated data at any time (Settings → Account → Delete Account, or email us)
- **Export** your data in a portable format upon request
- **Opt out** of non-essential communications

California residents may have additional rights under the CCPA. To submit a request, email hello@naviio.com with "CCPA Request" in the subject line.`,
  },
  {
    title: '8. Cookies',
    body: `We use a single session cookie ("markup_session") to maintain your authenticated session. We do not use third-party tracking cookies, advertising cookies, or analytics cookies. You may delete this cookie at any time, which will log you out of the platform.`,
  },
  {
    title: "9. Children's Privacy",
    body: `Naviio is intended for business use by adults. We do not knowingly collect personal information from anyone under the age of 18. If you believe we have inadvertently collected such information, contact us immediately.`,
  },
  {
    title: '10. Changes to This Policy',
    body: `We may update this Privacy Policy periodically. When we make material changes, we will notify you by email or via an in-app notice at least 30 days before the change takes effect. Continued use of the platform after the effective date constitutes acceptance of the updated policy.`,
  },
  {
    title: '11. Contact',
    body: `For privacy-related questions or to exercise your rights:\n\nNaviio, Inc.\nEmail: hello@naviio.com\nFairfield, CT`,
  },
]

export const TERMS_SECTIONS: Section[] = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using Naviio, you confirm that you can form a binding contract, that you are at least 18 years old, and that you are using the service for business purposes. If you use Naviio on behalf of a company, you represent that you have authority to bind that company to these Terms.`,
  },
  {
    title: '2. The Service',
    body: `Naviio aggregates financial data from integrations you authorize and presents dashboards, reports, forecasts, scoring, and AI-generated insights. The service is provided on a software-as-a-service basis and may change as we add, modify, or remove features over time.

We do not provide accounting, bookkeeping, audit, or tax-filing services. Naviio is a reporting and analytics tool, not a system of record.`,
  },
  {
    title: '3. Your Account',
    body: `You are responsible for safeguarding your login credentials and for all activity under your account. You agree to:

- Provide accurate registration information and keep it current
- Maintain the security of your password and session
- Notify us promptly at hello@naviio.com of any unauthorized access

You are responsible for the actions of any users you invite to your organization.`,
  },
  {
    title: '4. Acceptable Use',
    body: `You agree not to:

- Use the service for any unlawful purpose or in violation of any applicable law or regulation
- Attempt to gain unauthorized access to the platform, other accounts, or our systems
- Reverse engineer, scrape, or resell the service except as expressly permitted
- Upload malware or interfere with the integrity or performance of the platform
- Connect financial accounts you do not own or are not authorized to access

We may suspend or terminate accounts that violate this section.`,
  },
  {
    title: '5. Third-Party Integrations',
    body: `Naviio connects to third-party services at your direction, including Plaid, Stripe, QuickBooks Online, and Xero. Your use of each integration is also governed by that provider's own terms:

- **Plaid** — bank connectivity, governed by Plaid's end-user terms
- **Stripe** — payments and revenue data, governed by Stripe's terms
- **QuickBooks Online** — accounting data, governed by Intuit's terms
- **Xero** — accounting data, governed by Xero's terms

You authorize Naviio to access and store data from these providers solely to deliver the service. You may disconnect any integration at any time, which revokes our access and stops further syncing. We are not responsible for the availability, accuracy, or acts of third-party providers.`,
  },
  {
    title: '6. AI-Generated Insights',
    body: `Naviio uses artificial intelligence to generate summaries, insights, alerts, and scoring from your financial data. These outputs are produced automatically and may be incomplete, inaccurate, or out of date.

- AI insights are informational only and are **not** financial, investment, accounting, legal, or tax advice
- You should independently verify any figure or recommendation before acting on it
- We do not use data obtained through your connected integrations to train, fine-tune, adapt, or enhance any AI or machine-learning model; such data is used only to generate insights for you at the time of your request, consistent with each provider's requirements`,
  },
  {
    title: '7. Not Financial, Legal, or Tax Advice',
    body: `Naviio is a financial reporting and analytics tool. Nothing in the service constitutes financial, investment, accounting, legal, or tax advice, and no fiduciary or advisory relationship is created by your use of it. You are solely responsible for your business and financial decisions. Consult a qualified professional before making decisions based on information presented in Naviio.`,
  },
  {
    title: '8. Fees and Plans',
    body: `Certain features may require a paid subscription. Where fees apply, they will be disclosed before you subscribe. Fees are billed in advance and are non-refundable except as required by law. We may change pricing with at least 30 days' notice; changes take effect at your next billing cycle.`,
  },
  {
    title: '9. Intellectual Property',
    body: `Naviio and its software, design, and content are owned by Naviio, Inc. and protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable right to use the service during your subscription. You retain all rights to your own financial data; you grant us a limited license to process that data solely to operate the service.`,
  },
  {
    title: '10. Disclaimers',
    body: `The service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the service will be uninterrupted, error-free, or that any data displayed will be accurate or complete.`,
  },
  {
    title: '11. Limitation of Liability',
    body: `To the maximum extent permitted by law, Naviio and its officers, employees, and suppliers will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising from your use of the service. Our total liability for any claim relating to the service will not exceed the amount you paid us in the twelve months preceding the claim.`,
  },
  {
    title: '12. Termination',
    body: `You may stop using Naviio and delete your account at any time (Settings → Account → Delete Account). We may suspend or terminate your access if you breach these Terms or if required by law. Upon termination, your right to use the service ends and we will handle your data as described in our Privacy Policy.`,
  },
  {
    title: '13. Changes to These Terms',
    body: `We may update these Terms from time to time. When we make material changes, we will notify you by email or in-app notice at least 30 days before they take effect. Your continued use of the service after the effective date constitutes acceptance of the updated Terms.`,
  },
  {
    title: '14. Governing Law',
    body: `These Terms are governed by the laws of the State of Connecticut, United States, without regard to its conflict-of-laws rules. Any dispute will be resolved in the state or federal courts located in Connecticut, and you consent to their jurisdiction.`,
  },
  {
    title: '15. Contact',
    body: `Questions about these Terms:\n\nNaviio, Inc.\nEmail: hello@naviio.com\nFairfield, CT`,
  },
]

export function renderSections(sections: Section[]): ReactNode {
  return sections.map(({ title, body }) => (
    <section key={title} style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#F1F5F9' }}>{title}</h2>
      <div style={{ color: '#94A3B8', lineHeight: 1.8, fontSize: 15, whiteSpace: 'pre-line' }}>
        {body.split('\n').map((line, i) => {
          if (line.startsWith('- **') || line.startsWith('**')) {
            const parts = line.replace(/^-\s*/, '').split(/\*\*(.*?)\*\*/g)
            return (
              <p key={i} style={{ margin: '0.35rem 0', paddingLeft: line.startsWith('- ') ? '1rem' : 0 }}>
                {parts.map((part, j) => (j % 2 === 1 ? <strong key={j} style={{ color: '#CBD5E1' }}>{part}</strong> : part))}
              </p>
            )
          }
          if (line.startsWith('- ')) {
            return <p key={i} style={{ margin: '0.35rem 0', paddingLeft: '1rem' }}>{line.replace(/^-\s*/, '')}</p>
          }
          return <p key={i} style={{ margin: '0.35rem 0' }}>{line}</p>
        })}
      </div>
    </section>
  ))
}

export function ContactBody(): ReactNode {
  const contacts = [
    {
      label: 'Get in touch',
      email: 'hello@naviio.com',
      note: 'Questions about the product, your account, privacy, security, or our terms — reach us here and we will route it to the right person.',
    },
  ]
  return (
    <>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {contacts.map(({ label, email, note }) => (
          <div key={email} style={{ border: '1px solid #1E3055', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: '0.25rem' }}>{label}</p>
            <a href={`mailto:${email}`} style={{ fontSize: 16, fontWeight: 600, color: '#3B82F6', textDecoration: 'none' }}>{email}</a>
            <p style={{ color: '#94A3B8', fontSize: 14, lineHeight: 1.6, marginTop: '0.5rem' }}>{note}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '2.5rem', color: '#94A3B8', fontSize: 15, lineHeight: 1.8 }}>
        <p style={{ fontWeight: 600, color: '#CBD5E1', marginBottom: '0.25rem' }}>Naviio, Inc.</p>
        <p>Fairfield, CT</p>
      </div>
    </>
  )
}

export function DocBody({ doc }: { doc: DocKey }): ReactNode {
  if (doc === 'contact') return <ContactBody />
  return renderSections(doc === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS)
}
