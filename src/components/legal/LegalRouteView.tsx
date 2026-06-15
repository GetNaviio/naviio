'use client'

import { useRouter } from 'next/navigation'
import LegalModal from './LegalModal'
import type { DocKey } from './legalData'

export default function LegalRouteView({ doc }: { doc: DocKey }) {
  const router = useRouter()
  return (
    <LegalModal
      doc={doc}
      onClose={() => router.push('/')}
      onNavigate={(next) => router.push(`/${next}`)}
    />
  )
}
