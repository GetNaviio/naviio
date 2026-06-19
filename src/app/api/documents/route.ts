/**
 * Documents API — external file sharing. Files live in Dropbox; Naviio stores
 * only the connection and pointers.
 *
 *   GET                      → { connected, accountLabel, refs }
 *   GET ?browse=1&path=...   → live folder listing from Dropbox (to pick files)
 *   GET ?open=<refId>        → { url } a fresh temporary link to open the file
 *   POST  { externalId,... } → share a file into the workspace (pointer only)
 *   DELETE { id }            → unshare (removes the pointer, not the file)
 *
 * Sharing/unsharing requires the 'manage_documents' permission (owner, member,
 * or advisor). Browsing requires a connected source.
 */
import { z } from 'zod'
import { withOrg } from '@/lib/api/with-org'
import { isConfigured, listFolder, getTemporaryLink } from '@/lib/documents/dropbox'
import { getValidDropboxToken } from '@/lib/documents/session'
import { getDocumentSource, listDocumentRefs, addDocumentRef, removeDocumentRef } from '@/lib/documents/store'
import { can, getRole, logAccess } from '@/lib/firm/access'

export const GET = withOrg(async (request, { user, orgId }) => {
  const sp = new URL(request.url).searchParams

  // Open: mint a fresh temporary link for a shared pointer.
  if (sp.get('open')) {
    const refs = await listDocumentRefs(orgId)
    const ref = refs.find((r) => r.id === sp.get('open'))
    if (!ref) return Response.json({ error: 'Not found' }, { status: 404 })
    const token = await getValidDropboxToken(orgId)
    if (!token) return Response.json({ error: 'Dropbox not connected' }, { status: 409 })
    const url = await getTemporaryLink(token, ref.path ?? ref.externalId)
    if (!url) return Response.json({ error: 'Could not open file' }, { status: 502 })
    await logAccess(orgId, user.id, 'document_open', ref.name)
    return Response.json({ url })
  }

  // Browse: live folder listing so the user can pick files to share.
  if (sp.get('browse')) {
    const token = await getValidDropboxToken(orgId)
    if (!token) return Response.json({ error: 'Dropbox not connected' }, { status: 409 })
    try {
      const entries = await listFolder(token, sp.get('path') ?? '')
      return Response.json({ entries })
    } catch (e) {
      console.error('Dropbox browse failed:', e)
      return Response.json({ error: 'Could not list Dropbox folder' }, { status: 502 })
    }
  }

  const source = await getDocumentSource(orgId, 'dropbox')
  const refs = await listDocumentRefs(orgId)
  return Response.json({
    configured: isConfigured(),
    connected: !!source && source.status === 'connected',
    accountLabel: source?.accountLabel ?? null,
    refs,
  })
})

const ShareSchema = z.object({
  externalId: z.string().min(1).max(1024),
  name: z.string().min(1).max(512),
  path: z.string().max(1024).optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  modifiedAt: z.string().datetime().nullable().optional(),
})

export const POST = withOrg(async (request, { user, orgId }) => {
  if (!can(await getRole(orgId, user.id), 'manage_documents'))
    return Response.json({ error: 'You do not have permission to share documents here.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const parsed = ShareSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid file' }, { status: 400 })

  await addDocumentRef({
    orgId,
    provider: 'dropbox',
    externalId: parsed.data.externalId,
    name: parsed.data.name,
    path: parsed.data.path ?? parsed.data.externalId,
    sizeBytes: parsed.data.sizeBytes ?? null,
    modifiedAt: parsed.data.modifiedAt ? new Date(parsed.data.modifiedAt) : null,
    sharedByUserId: user.id,
  })
  await logAccess(orgId, user.id, 'document_shared', parsed.data.name)
  return Response.json({ ok: true }, { status: 201 })
})

const UnshareSchema = z.object({ id: z.string().min(1).max(64) })

export const DELETE = withOrg(async (request, { user, orgId }) => {
  if (!can(await getRole(orgId, user.id), 'manage_documents'))
    return Response.json({ error: 'You do not have permission to manage documents here.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const parsed = UnshareSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'id is required' }, { status: 400 })

  await removeDocumentRef(orgId, parsed.data.id)
  return Response.json({ ok: true })
})
