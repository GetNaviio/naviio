/**
 * Firm client roster (fractional CFO).
 *   GET  — the CFO's clients + pending invites
 *   POST — add a client: creates a one-time invite link the client uses to sign
 *          up / log in with THEIR OWN account and grant the advisor access.
 */
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-org'
import { rateLimit } from '@/lib/rate-limit'
import { getFirmForOwner, getOrCreateFirm, listFirmClients, listPendingClientInvites } from '@/lib/firm/firm'
import { createClientInvite } from '@/lib/firm/clients'

export const GET = withAuth(async (_request, { user }) => {
  const firm = await getFirmForOwner(user.id)
  if (!firm) return Response.json({ firm: null, clients: [], pending: [] })
  const [clients, pending] = await Promise.all([
    listFirmClients(firm.id),
    listPendingClientInvites(firm.id),
  ])
  return Response.json({
    firm: { id: firm.id, name: firm.name, brandLogoUrl: firm.brandLogoUrl, brandColor: firm.brandColor },
    clients,
    pending,
  })
})

const AddClientSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional(),
  firmName: z.string().trim().min(1).max(120).optional(),
})

export const POST = withAuth(async (request, { user }) => {
  const limited = await rateLimit(request, 'client-invite', { limit: 50, windowSeconds: 3600 })
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const parsed = AddClientSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'A valid client email is required' }, { status: 400 })

  if (parsed.data.email === user.email.toLowerCase())
    return Response.json({ error: "That's your own email — invite a client instead." }, { status: 409 })

  // Lazily create the CFO's firm on first add.
  const seedName = parsed.data.firmName || (user.name ? `${user.name}'s Practice` : 'My Practice')
  const firm = await getOrCreateFirm(user.id, seedName)

  const invite = await createClientInvite({
    firmId: firm.id,
    advisorUserId: user.id,
    clientEmail: parsed.data.email,
    clientName: parsed.data.name ?? null,
  })

  const inviteUrl = `${new URL(request.url).origin}/client-invite/${invite.rawToken}`
  return Response.json(
    {
      ok: true,
      inviteUrl,
      clientEmail: parsed.data.email,
      expiresAt: invite.expiresAt.toISOString(),
      firmName: firm.name,
    },
    { status: 201 },
  )
})
