/**
 * Dropbox OAuth + file-listing client. Naviio NEVER stores file contents — only
 * the OAuth connection (DocumentSource) and pointers/links (DocumentRef). This
 * module just speaks the Dropbox API: build the authorize URL, exchange the code,
 * refresh the token, list a folder, and mint a temporary view link.
 *
 * Env-gated (DROPBOX_CLIENT_ID / DROPBOX_CLIENT_SECRET). When unset, isConfigured()
 * is false and the UI hides the connect button.
 */
const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize'
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const API = 'https://api.dropboxapi.com/2'

export function isConfigured(): boolean {
  return !!(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET)
}

function redirectUri(origin?: string): string {
  return process.env.DROPBOX_REDIRECT_URI ?? `${origin ?? process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/auth/dropbox/callback`
}

/** Authorize URL. token_access_type=offline → we get a refresh token. */
export function getAuthUrl(state: string, origin?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DROPBOX_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: redirectUri(origin),
    token_access_type: 'offline',
    // Read-only scopes: list folders + read file metadata/links. No write/delete.
    scope: 'files.metadata.read files.content.read account_info.read sharing.read',
    state,
  })
  return `${AUTH_URL}?${params}`
}

export interface DropboxTokens {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number | null
  accountLabel?: string | null
}

function basicAuth(): string {
  return Buffer.from(`${process.env.DROPBOX_CLIENT_ID}:${process.env.DROPBOX_CLIENT_SECRET}`).toString('base64')
}

export async function exchangeCode(code: string, origin?: string): Promise<DropboxTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth()}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(origin) }),
  })
  if (!res.ok) throw new Error(`Dropbox token exchange failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  const tokens: DropboxTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
  }
  tokens.accountLabel = await getAccountLabel(tokens.accessToken).catch(() => null)
  return tokens
}

/** Refresh an expired access token using the stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<DropboxTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth()}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status}`)
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken, expiresIn: data.expires_in ?? null }
}

async function getAccountLabel(accessToken: string): Promise<string | null> {
  const res = await fetch(`${API}/users/get_current_account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.name?.display_name ?? data?.email ?? null
}

export interface DropboxFile {
  externalId: string // path_lower (stable id for our DocumentRef)
  name: string
  path: string
  sizeBytes: number | null
  modifiedAt: string | null
  isFolder: boolean
}

/** List a folder (default root). Read-only. */
export async function listFolder(accessToken: string, path = ''): Promise<DropboxFile[]> {
  const res = await fetch(`${API}/files/list_folder`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, recursive: false, limit: 200 }),
  })
  if (!res.ok) throw new Error(`Dropbox list_folder failed: ${res.status}`)
  const data = await res.json()
  return (data.entries ?? []).map(
    (e: { '.tag': string; name: string; path_display?: string; path_lower?: string; size?: number; server_modified?: string }) => ({
      externalId: e.path_lower ?? e.path_display ?? e.name,
      name: e.name,
      path: e.path_display ?? e.name,
      sizeBytes: typeof e.size === 'number' ? e.size : null,
      modifiedAt: e.server_modified ?? null,
      isFolder: e['.tag'] === 'folder',
    }),
  )
}

/** A temporary, direct view link to a file (4 hours). Falls back to null. */
export async function getTemporaryLink(accessToken: string, path: string): Promise<string | null> {
  const res = await fetch(`${API}/files/get_temporary_link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.link ?? null
}
