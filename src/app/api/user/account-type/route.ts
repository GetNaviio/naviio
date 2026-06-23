import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

// Persist the onboarding account type. Raw SQL write so it works before
// `prisma generate` picks up the new column on the build host.
const Schema = z.object({ accountType: z.enum(['owner', 'advisor']) })

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const parsed = Schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Invalid account type' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`UPDATE "User" SET "accountType" = ${parsed.data.accountType} WHERE "id" = ${user.id}`)
    return Response.json({ ok: true, accountType: parsed.data.accountType })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
}
