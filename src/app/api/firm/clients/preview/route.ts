/**
 * Public preview of a client-invite link (no auth, no token echoed back) so the
 * landing page can show who invited the client and what access is requested.
 */
import { previewClientInvite } from '@/lib/firm/clients'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const limited = await rateLimit(request, 'client-invite-preview', { limit: 60, windowSeconds: 600 })
  if (limited) return limited
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!token) return Response.json({ status: 'invalid' }, { status: 400 })
  const preview = await previewClientInvite(token)
  return Response.json(preview)
}
