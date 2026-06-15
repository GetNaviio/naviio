import type { Metadata } from 'next'
import LegalRouteView from '@/components/legal/LegalRouteView'

export const metadata: Metadata = {
  title: 'Terms of Service — Naviio',
  description: 'The terms governing your use of the Naviio financial intelligence platform.',
}

export default function TermsPage() {
  return <LegalRouteView doc="terms" />
}
