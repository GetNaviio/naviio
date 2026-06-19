/**
 * Accept a client invite. The ACCEPTING user is the client, logging in with their
 * own account. On success the advisor is added as an ADVISOR member of the
 * client's own org, the org is linked to the firm, consent is recorded, and the
 * client is dropped into their own workspace.
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { prisma } from '@/lib/prisma'
import { acceptClientInvite } from '@/lib/firm/clients'

const AcceptSchema = z.object({ token: z.string().min(10).max(256) })

export const POST = withAuth(async (request, { user }) => {
  const body = await request.json().catch(() => null)
  const parsed = AcceptSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'A valid invite token is required' }, { status: 400 })

  const result = await acceptClientInvite(parsed.data.token, user)
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 })

  // Land the client in their own org.
  if (result.orgId) {
    await prisma.user.update({ where: { id: user.id }, data: { activeOrgId: result.orgId } }).catch(() => {})
  }
  return Response.json({ ok: true, orgId: result.orgId })
})
