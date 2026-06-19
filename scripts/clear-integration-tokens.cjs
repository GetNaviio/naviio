#!/usr/bin/env node
/**
 * Clear undecryptable provider tokens after a TOKEN_ENCRYPTION_KEY change.
 * Nulls accessToken/refreshToken and marks integrations DISCONNECTED so the app
 * stops trying (and failing) to decrypt them. Reconnect afterwards.
 *
 *   node scripts/clear-integration-tokens.cjs
 *
 * Transaction history is NOT touched — only the connection tokens.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

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
  console.error('DATABASE_URL not found (.env.local / .env / .env.save).')
  process.exit(1)
}

;(async () => {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const before = await client.query(
      `SELECT provider, status, ("accessToken" IS NOT NULL) AS has_token FROM "Integration"`,
    )
    console.log(`Found ${before.rows.length} integration row(s):`)
    for (const r of before.rows) console.log(`  ${r.provider.padEnd(12)} status=${r.status} hasToken=${r.has_token}`)

    const res = await client.query(
      `UPDATE "Integration" SET "accessToken" = NULL, "refreshToken" = NULL, "status" = 'DISCONNECTED'
       WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL`,
    )
    console.log(`\nCleared tokens on ${res.rowCount} row(s). Restart the app and reconnect.`)
  } finally {
    await client.end()
  }
})().catch((e) => {
  console.error('Failed:', e.message)
  process.exit(1)
})
