import { cookies } from 'next/headers'
import { clearSessionCookie, revokeToken } from '@/lib/auth'

const COOKIE_NAME = 'markup_session'

export async function POST() {
  // Revoke server-side FIRST — clearing only the cookie leaves the JWT valid
  // for its remaining lifetime if it was ever captured.
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) await revokeToken(token)

  await clearSessionCookie()
  return Response.json({ success: true })
}
