import { prisma } from '@/lib/prisma'
import { hashPassword, signToken, setSessionCookie } from '@/lib/auth'
import { parseBody, RegisterSchema } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const limited = await rateLimit(request, 'register')
    if (limited) return limited

    const parsed = await parseBody(request, RegisterSchema)
    if (!parsed.ok) return parsed.response
    const { email, password, name, company } = parsed.data // email normalized by schema

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return Response.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    })

    // Create the user's Organization now, named after the company they typed
    // (previously the org was created lazily on first data request and named
    // after the person's name/email). getDefaultOrgId will find this one.
    const orgName = company?.trim() || name?.trim() || email
    await prisma.organization.create({ data: { name: orgName, userId: user.id } })

    const token = signToken({ userId: user.id, email: user.email })
    await setSessionCookie(token)

    return Response.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
