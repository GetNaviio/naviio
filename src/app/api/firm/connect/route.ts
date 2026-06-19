/**
 * Stripe Connect onboarding for Option-2 (white_label_saas) firms, so they can
 * receive client payments with Naviio's commission taken as an application fee.
 *   POST — start (or resume) onboarding; returns the hosted onboarding URL.
 *   GET  — refresh and return the Connect status (none | pending | enabled).
 */
import { withAuth } from '@/lib/api/with-org'
import { getFirmForOwner } from '@/lib/firm/firm'
import { getFirmBilling, setFirmConnect } from '@/lib/firm/billing-store'
import { isBillingConfigured, createConnectOnboarding, getConnectStatus } from '@/lib/firm/stripe-billing'

export const POST = withAuth(async (request, { user }) => {
  if (!isBillingConfigured()) return Response.json({ error: 'Billing is not configured on this server.' }, { status: 503 })
  const firm = await getFirmForOwner(user.id)
  if (!firm) return Response.json({ error: 'Add a client first to create your firm.' }, { status: 404 })
  const billing = await getFirmBilling(firm.id)
  if (billing?.plan !== 'white_label_saas')
    return Response.json({ error: 'Connect is only needed on the SaaS resale plan.' }, { status: 409 })

  const origin = new URL(request.url).origin
  try {
    const { accountId, url } = await createConnectOnboarding({
      existingAccountId: billing?.stripeConnectAccountId ?? null,
      firmName: firm.name,
      email: user.email,
      refreshUrl: `${origin}/clients?connect=refresh`,
      returnUrl: `${origin}/clients?connect=done`,
    })
    await setFirmConnect(firm.id, accountId, 'pending')
    return Response.json({ url })
  } catch (e) {
    console.error('Connect onboarding failed:', e)
    return Response.json({ error: 'Could not start Stripe onboarding.' }, { status: 502 })
  }
})

export const GET = withAuth(async (_request, { user }) => {
  const firm = await getFirmForOwner(user.id)
  if (!firm) return Response.json({ status: 'none' })
  const billing = await getFirmBilling(firm.id)
  if (!billing?.stripeConnectAccountId) return Response.json({ status: billing?.connectStatus ?? 'none' })
  if (!isBillingConfigured()) return Response.json({ status: billing.connectStatus })
  try {
    const status = await getConnectStatus(billing.stripeConnectAccountId)
    if (status !== billing.connectStatus) await setFirmConnect(firm.id, billing.stripeConnectAccountId, status)
    return Response.json({ status })
  } catch {
    return Response.json({ status: billing.connectStatus })
  }
})
