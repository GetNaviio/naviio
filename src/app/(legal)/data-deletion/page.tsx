import { renderSections } from '@/components/legal/legalData'

export const metadata = { title: 'Data Deletion — Naviio' }

const SECTIONS = [
  {
    title: '1. Delete your account and all data',
    body: `You can delete your Naviio account and all associated data at any time:

- Sign in to Naviio and open **Settings**
- Choose **Delete account** and confirm

Your access is disabled immediately. Your account record and all associated data — financial transactions, reports, integration tokens, and AI-generated content — are permanently and irreversibly deleted from our systems within 30 days.`,
  },
  {
    title: '2. Disconnect a single integration',
    body: `If you only want to remove data from one connected service (for example Meta Ads, Google Ads, your bank, or Stripe):

- Open the **Integrations** page in Naviio
- Click **Disconnect** on that integration

Disconnecting revokes and deletes the stored access tokens for that service and stops all data syncing from it. You can also revoke Naviio's access from the provider's side at any time (for example, in your Facebook settings under Business Integrations, or your Google Account permissions).`,
  },
  {
    title: '3. Request deletion by email',
    body: `If you cannot access your account, or want confirmation of deletion, email us:

- **hello@naviio.com** — subject "Data deletion request"

Include the email address associated with your account. We process deletion requests within 30 days and will confirm when complete.`,
  },
]

export default function DataDeletionPage() {
  return (
    <article>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>Data Deletion</h1>
      <p style={{ color: '#94A3B8', lineHeight: 1.7, marginBottom: '2rem' }}>
        How to delete your data from Naviio — your whole account, a single connected integration, or by emailing us directly.
      </p>
      {renderSections(SECTIONS)}
    </article>
  )
}
