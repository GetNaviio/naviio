/**
 * Shared OAuth callback flow for all integration providers.
 *
 * Every provider callback does the same five steps: check provider error param
 * → decode the signed state → resolve the org → exchange the code for tokens →
 * upsert the Integration row → redirect back to /integrations. Previously this
 * was copy-pasted across 8 route files (~320 lines); each route now declares
 * only what differs (exchange function, stored realmId, optional post-connect
 * sync).
 *
 * IMPORTANT: next/navigation `redirect()` throws NEXT_REDIRECT internally — the
 * success redirect must stay OUTSIDE the try/catch (as in the original routes)
 * or the catch would swallow it and report a failure.
 */
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getDefaultOrgId } from '@/lib/auth'
import type { IntegrationProvider } from '@prisma/client'

export type OAuthExchangeResult = {
  accessToken: string
  refreshToken?: string | null
  /** Provider-side account/tenant id stored in Integration.realmId */
  realmId?: string | null
  /** Seconds until the access token expires; omit for non-expiring tokens */
  expiresIn?: number | null
}

export type OAuthCallbackConfig = {
  provider: IntegrationProvider
  /** Slug for redirect error params: `?error={errorSlug}_denied|_failed` */
  errorSlug: string
  /** Slug for the success redirect: `?success={successSlug}` */
  successSlug: string
  /** Label used in server-side error logs */
  label: string
  /** Throw before exchange when the `code` query param is missing */
  requireCode?: boolean
  /** Exchange the authorization code for tokens (given full request context) */
  exchange: (ctx: {
    request: Request
    code: string
    searchParams: URLSearchParams
  }) => Promise<OAuthExchangeResult>
  /** Best-effort work after connect (e.g. initial transaction sync). Errors are logged, never block the redirect. */
  postConnect?: (orgId: string) => Promise<unknown>
}

export async function completeOAuthCallback(
  request: Request,
  cfg: OAuthCallbackConfig,
): Promise<never> {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('error')) redirect(`/integrations?error=${cfg.errorSlug}_denied`)

  try {
    const state = searchParams.get('state') ?? ''
    const code = searchParams.get('code') ?? ''
    if (!state) throw new Error('missing OAuth state')
    if (cfg.requireCode && !code) throw new Error('missing code')

    let userId: string
    try {
      userId = JSON.parse(Buffer.from(state, 'base64').toString()).userId
    } catch {
      throw new Error('could not parse OAuth state')
    }
    if (!userId) throw new Error('could not parse OAuth state')

    const orgId = await getDefaultOrgId(userId)
    const { accessToken, refreshToken, realmId, expiresIn } = await cfg.exchange({
      request,
      code,
      searchParams,
    })

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
    const common = {
      status: 'CONNECTED' as const,
      accessToken,
      refreshToken: refreshToken ?? undefined,
      realmId: realmId ?? undefined,
      expiresAt,
      lastSyncedAt: new Date(),
    }
    await prisma.integration.upsert({
      where: { orgId_provider: { orgId, provider: cfg.provider } },
      create: { orgId, provider: cfg.provider, ...common },
      update: common,
    })

    if (cfg.postConnect) {
      await cfg.postConnect(orgId).catch((e) =>
        console.error(`${cfg.label} post-connect sync failed:`, e),
      )
    }
  } catch (err) {
    console.error(`${cfg.label} callback error:`, err)
    redirect(`/integrations?error=${cfg.errorSlug}_failed`)
  }

  redirect(`/integrations?success=${cfg.successSlug}`)
}
