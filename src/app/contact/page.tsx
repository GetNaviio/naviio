import type { Metadata } from 'next'
import LegalRouteView from '@/components/legal/LegalRouteView'

export const metadata: Metadata = {
  title: 'Contact — Naviio',
  description: 'Get in touch with the Naviio team.',
}

export default function ContactPage() {
  return <LegalRouteView doc="contact" />
}
