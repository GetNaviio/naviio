/**
 * Returns a currently-valid Dropbox access token for an org, transparently
 * refreshing (and re-persisting) when the stored one has expired.
 */
import { getDocumentSource, updateAccessToken } from '@/lib/documents/store'
import { refreshAccessToken } from '@/lib/documents/dropbox'

export async function getValidDropboxToken(orgId: string): Promise<string | null> {
  const src = await getDocumentSource(orgId, 'dropbox')
  if (!src || src.status !== 'connected' || !src.accessToken) return null

  const expired = src.expiresAt ? src.expiresAt.getTime() < Date.now() + 60_000 : false
  if (!expired) return src.accessToken
  if (!src.refreshToken) return src.accessToken // short-lived token, no refresh available

  try {
    const refreshed = await refreshAccessToken(src.refreshToken)
    const expiresAt = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null
    await updateAccessToken(orgId, 'dropbox', refreshed.accessToken, expiresAt)
    return refreshed.accessToken
  } catch (e) {
    console.error('Dropbox token refresh failed:', e)
    return src.accessToken
  }
}
