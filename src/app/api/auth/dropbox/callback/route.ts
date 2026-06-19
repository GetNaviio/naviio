/**
 * Dropbox OAuth callback. Mirrors the shared integration callback pattern but
 * writes to DocumentSource (with app-encrypted tokens) instead of Integration,
 * since file sharing is intentionally separate from financial integrations.
 *
 * The success/error redirect uses next/navigation redirect(), which throws
 * NEXT_REDIRECT — keep it OUTSIDE the try/catch.
 */
import { redirect } from 'next/navigation'
import { getDefaultOrgId } from '@/lib/auth'
import { exchangeCode } from '@/lib/documents/dropbox'
import { upsertDocumentSource } from '@/lib/documents/store'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  if (searchParams.get('error')) redirect('/documents?error=dropbox_denied')

  try {
    const state = searchParams.get('state') ?? ''
    const code = searchParams.get('code') ?? ''
    if (!state || !code) throw new Error('missing state/code')

    let userId: string
    try {
      userId = JSON.parse(Buffer.from(state, 'base64').toString()).userId
    } catch {
      throw new Error('could not parse OAuth state')
    }
    if (!userId) throw new Error('could not parse OAuth state')

    const orgId = await getDefaultOrgId(userId)
    const tokens = await exchangeCode(code, origin)
    await upsertDocumentSource({
      orgId,
      provider: 'dropbox',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accountLabel: tokens.accountLabel ?? null,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    })
  } catch (err) {
    console.error('Dropbox callback error:', err)
    redirect('/documents?error=dropbox_failed')
  }

  redirect('/documents?success=dropbox')
}
