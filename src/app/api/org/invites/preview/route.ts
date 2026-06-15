/**
 * Public invite preview — what the invitee sees before logging in.
 * Token comes in by query param; only its hash ever touches the database.
 * Invalid tokens get { valid: false }, never a distinguishable error (no
 * oracle for token guessing — and guesses are 256-bit, so moot anyway).
 */
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { hashInviteToken } from '@/lib/org'

export async function GET(request: Request) {
  const limited = await rateLimit(request, 'invite_preview', { limit: 60, windowSeconds: 600 })
  if (limited) return limited

  const token = new URL(request.url).searchParams.get('token')
  if (!token || token.length > 128) return Response.json({ valid: false })

  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { email: true, role: true, expiresAt: true, acceptedAt: true, org: { select: { name: true } } },
  })
  if (!invite) return Response.json({ valid: false })

  return Response.json({
    valid: invite.acceptedAt === null && invite.expiresAt.getTime() > Date.now(),
    accepted: invite.acceptedAt !== null,
    expired: invite.expiresAt.getTime() <= Date.now(),
    orgName: invite.org.name,
    email: invite.email,
    role: invite.role,
  })
}
