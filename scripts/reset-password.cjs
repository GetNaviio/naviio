#!/usr/bin/env node
/**
 * Reset a user's password directly in the DB (local/dev recovery). Uses the same
 * bcryptjs hashing as the app, and clears MFA so you can log straight in.
 *
 *   node scripts/reset-password.cjs you@email.com 'YourNewPassword'
 *
 * (You can re-enable 2FA afterward in Settings → Security — the bank-connect flow
 *  requires it.)
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const bcrypt = require('bcryptjs')

const [, , emailArg, passwordArg] = process.argv
if (!emailArg || !passwordArg) {
  console.error("Usage: node scripts/reset-password.cjs you@email.com 'NewPassword'")
  process.exit(1)
}
const email = emailArg.trim().toLowerCase()
if (passwordArg.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const env = {}
for (const name of ['.env.local', '.env', '.env.save']) {
  const p = path.join(__dirname, '..', name)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.DATABASE_URL || env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not found.')
  process.exit(1)
}

;(async () => {
  const hash = bcrypt.hashSync(passwordArg, 12)
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query(
      `UPDATE "User" SET "passwordHash" = $1, "mfaEnabled" = false, "mfaSecret" = NULL WHERE lower("email") = $2 RETURNING "id","email"`,
      [hash, email],
    )
    if (res.rowCount === 0) {
      const all = await client.query(`SELECT "email" FROM "User" ORDER BY "createdAt" LIMIT 20`)
      console.error(`\nNo user with email "${email}". Existing users:`)
      for (const r of all.rows) console.error('  ' + r.email)
      process.exit(1)
    }
    console.log(`\n✅ Password reset for ${res.rows[0].email}. MFA cleared. Log in with the new password.`)
  } finally {
    await client.end()
  }
})().catch((e) => {
  console.error('Failed:', e.message)
  process.exit(1)
})
