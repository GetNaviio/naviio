import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { parseBody, WaitlistSchema } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'

// Public: anyone can join the waitlist.
export async function POST(req: Request) {
  try {
    const limited = await rateLimit(req, 'waitlist')
    if (limited) return limited

    const parsed = await parseBody(req, WaitlistSchema)
    if (!parsed.ok) return parsed.response
    const { email, product } = parsed.data // trimmed + lowercased by schema

    await prisma.waitlist.upsert({
      where: { email_product: { email, product } },
      update: {},
      create: { email, product },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Waitlist signup error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not join the waitlist. Please try again.' }, { status: 500 })
  }
}

// Authenticated + admin-only: list signups (newest first) for the internal
// admin view. Gated on ADMIN_EMAILS (comma-separated) — without the gate, ANY
// registered user could dump every signup email (PII). Fails closed when
// ADMIN_EMAILS is unset; scripts/waitlist.cjs reads the DB directly and is
// unaffected.
function isAdmin(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.toLowerCase())
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    if (!isAdmin(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Optional ?product=card|app filter for the admin view.
    const productParam = new URL(req.url).searchParams.get('product')
    const where = productParam === 'card' || productParam === 'app' ? { product: productParam } : {}
    const entries = await prisma.waitlist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, product: true, createdAt: true },
    })
    return NextResponse.json({ count: entries.length, entries })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Waitlist list error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load waitlist' }, { status: 500 })
  }
}
