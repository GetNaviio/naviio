import type { Metadata } from 'next'
import LegalRouteView from '@/components/legal/LegalRouteView'

export const metadata: Metadata = {
  title: 'Privacy Policy — Naviio',
  description: 'How Naviio collects, uses, and protects your financial data.',
}

export default function PrivacyPage() {
  return <LegalRouteView doc="privacy" />
}
