import { parseObject, RegisterSchema, LoginSchema, WaitlistSchema } from '@/lib/validate'

describe('RegisterSchema', () => {
  it('accepts a valid registration and normalizes the email', () => {
    const r = parseObject({ email: '  Foo@Bar.COM ', password: 'longenough1', name: ' Eric ' }, RegisterSchema)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.email).toBe('foo@bar.com') // trimmed + lowercased
      expect(r.data.name).toBe('Eric')
    }
  })

  it('rejects malformed emails', () => {
    const r = parseObject({ email: 'not-an-email', password: 'longenough1' }, RegisterSchema)
    expect(r.ok).toBe(false)
  })

  it('rejects passwords under 8 chars', () => {
    const r = parseObject({ email: 'a@b.co', password: 'short' }, RegisterSchema)
    expect(r.ok).toBe(false)
  })

  it('rejects oversized inputs (DoS guard)', () => {
    const r = parseObject({ email: 'a@b.co', password: 'x'.repeat(129) }, RegisterSchema)
    expect(r.ok).toBe(false)
  })

  it('returns a 400 Response with field errors on failure', async () => {
    const r = parseObject({ email: 'bad', password: '' }, RegisterSchema)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(400)
      const body = await r.response.json()
      expect(body.error).toBe('Invalid request')
      expect(body.details).toBeDefined()
    }
  })
})

describe('LoginSchema / WaitlistSchema', () => {
  it('login requires non-empty password', () => {
    expect(parseObject({ email: 'a@b.co', password: '' }, LoginSchema).ok).toBe(false)
    expect(parseObject({ email: 'a@b.co', password: 'p' }, LoginSchema).ok).toBe(true)
  })

  it('waitlist normalizes email', () => {
    const r = parseObject({ email: ' X@Y.IO ' }, WaitlistSchema)
    expect(r.ok && r.data.email === 'x@y.io').toBe(true)
  })
})
