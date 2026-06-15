/**
 * Request-body validation for API routes (zod).
 *
 * Usage:
 *   const parsed = await parseBody(request, RegisterSchema)
 *   if (!parsed.ok) return parsed.response   // 400 with field errors
 *   const { email, password } = parsed.data  // fully typed
 *
 * Centralized so every route returns the same 400 shape:
 *   { error: 'Invalid request', details: { field: ['message'] } }
 */
import { z } from 'zod'

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Invalid email address' }))
  .pipe(z.string().max(254))

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().trim().min(1).max(100).optional(),
})

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
})

export const WaitlistSchema = z.object({
  email: EmailSchema,
})

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response }

function badRequest(details: unknown): Response {
  return Response.json({ error: 'Invalid request', details }, { status: 400 })
}

/** Parse + validate a JSON body. Returns a ready 400 Response on failure. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.output<S>>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: badRequest('Body must be valid JSON') }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { ok: false, response: badRequest(z.flattenError(result.error).fieldErrors) }
  }
  return { ok: true, data: result.data }
}

/** Validate an already-extracted object (e.g. from formData). */
export function parseObject<S extends z.ZodType>(
  raw: unknown,
  schema: S,
): ParseResult<z.output<S>> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { ok: false, response: badRequest(z.flattenError(result.error).fieldErrors) }
  }
  return { ok: true, data: result.data }
}
