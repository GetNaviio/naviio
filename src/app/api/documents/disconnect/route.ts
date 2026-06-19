/** Disconnect the org's Dropbox source (clears tokens). Pointers are left as-is
 *  but will no longer open until reconnected. Requires manage_documents. */
import { withOrg } from '@/lib/api/with-org'
import { disconnectDocumentSource } from '@/lib/documents/store'
import { can, getRole, logAccess } from '@/lib/firm/access'

export const POST = withOrg(async (_request, { user, orgId }) => {
  if (!can(await getRole(orgId, user.id), 'manage_documents'))
    return Response.json({ error: 'Not allowed' }, { status: 403 })
  await disconnectDocumentSource(orgId, 'dropbox')
  await logAccess(orgId, user.id, 'document_source_disconnected', 'dropbox')
  return Response.json({ ok: true })
})
