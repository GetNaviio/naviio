/**
 * White-label branding (CFO Suite) — pins: owner-only + CFO-plan gating,
 * https/hex validation (never store a broken logo on a client-facing page),
 * empty-clears-field semantics, and the canEdit flag the UI reads.
 */
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  getDefaultOrgId: jest.fn(),
}))
jest.mock('@/lib/org', () => ({ getOrgRole: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: { organization: { findUniqueOrThrow: jest.fn(), update: jest.fn() } },
}))

import { GET as getBranding, PATCH as patchBranding } from '@/app/api/org/branding/route'
import { isValidLogoUrl, isValidBrandColor } from '@/lib/branding'

const { requireAuth, getDefaultOrgId } = jest.requireMock('@/lib/auth') as {
  requireAuth: jest.Mock; getDefaultOrgId: jest.Mock
}
const { getOrgRole } = jest.requireMock('@/lib/org') as { getOrgRole: jest.Mock }
const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { organization: Record<'findUniqueOrThrow' | 'update', jest.Mock> }
}

const OWNER = { id: 'owner1', email: 'owner@firm.io' }

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue(OWNER)
  getDefaultOrgId.mockResolvedValue('org1')
  getOrgRole.mockResolvedValue('OWNER')
  prisma.organization.findUniqueOrThrow.mockResolvedValue({
    plan: 'CFO', brandLogoUrl: null, brandColor: null, hideNaviioBranding: false,
  })
  prisma.organization.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    brandLogoUrl: data.brandLogoUrl ?? null,
    brandColor: data.brandColor ?? null,
    hideNaviioBranding: data.hideNaviioBranding ?? false,
  }))
})

const patch = (body: unknown) =>
  patchBranding(new Request('http://test/api/org/branding', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))

describe('branding validators', () => {
  it('logo: https only, no http/data:', () => {
    expect(isValidLogoUrl('https://acme.com/logo.png')).toBe(true)
    expect(isValidLogoUrl('http://acme.com/logo.png')).toBe(false)
    expect(isValidLogoUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isValidLogoUrl('not a url')).toBe(false)
  })
  it('color: 3/6-digit hex only', () => {
    expect(isValidBrandColor('#2563EB')).toBe(true)
    expect(isValidBrandColor('#abc')).toBe(true)
    expect(isValidBrandColor('blue')).toBe(false)
    expect(isValidBrandColor('#12')).toBe(false)
  })
})

describe('GET /api/org/branding', () => {
  it('canEdit true for a CFO-plan owner', async () => {
    const body = await (await getBranding(new Request('http://test/api/org/branding'))).json()
    expect(body.canEdit).toBe(true)
    expect(body.plan).toBe('CFO')
  })
  it('canEdit false on a non-CFO plan', async () => {
    prisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'PRO', brandLogoUrl: null, brandColor: null, hideNaviioBranding: false })
    const body = await (await getBranding(new Request('http://test/api/org/branding'))).json()
    expect(body.canEdit).toBe(false)
  })
})

describe('PATCH /api/org/branding', () => {
  it('CFO-plan owner saves a valid logo + color', async () => {
    const res = await patch({ logoUrl: 'https://acme.com/logo.png', color: '#2563EB' })
    expect(res.status).toBe(200)
    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org1' },
      data: expect.objectContaining({ brandLogoUrl: 'https://acme.com/logo.png', brandColor: '#2563EB' }),
    }))
  })

  it('403s CFO_REQUIRED on a non-CFO plan', async () => {
    prisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'GROWTH' })
    const res = await patch({ color: '#2563EB' })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CFO_REQUIRED')
    expect(prisma.organization.update).not.toHaveBeenCalled()
  })

  it('403s for a non-owner member', async () => {
    getOrgRole.mockResolvedValue('MEMBER')
    const res = await patch({ color: '#2563EB' })
    expect(res.status).toBe(403)
    expect(prisma.organization.update).not.toHaveBeenCalled()
  })

  it('400s a non-https logo and a non-hex color', async () => {
    expect((await patch({ logoUrl: 'http://acme.com/x.png' })).status).toBe(400)
    expect((await patch({ color: 'red' })).status).toBe(400)
    expect(prisma.organization.update).not.toHaveBeenCalled()
  })

  it('empty string clears a field to null', async () => {
    await patch({ logoUrl: '', color: '' })
    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ brandLogoUrl: null, brandColor: null }),
    }))
  })
})
