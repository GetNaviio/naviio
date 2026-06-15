#!/usr/bin/env node
/**
 * List waitlist signups straight from the database — no app UI needed.
 *
 *   node scripts/waitlist.cjs           # newest first, full list + count
 *   node scripts/waitlist.cjs --count   # just the total
 *   node scripts/waitlist.cjs --csv     # CSV (email,createdAt) for export
 *
 * Uses DATABASE_URL from .env. Point it at the same Neon DB production writes to.
 */
require('dotenv/config')
const { Client } = require('pg')

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set (check your .env).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const countOnly = args.includes('--count')
  const asCsv = args.includes('--csv')

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query(
      'SELECT email, "createdAt" FROM "Waitlist" ORDER BY "createdAt" DESC',
    )

    if (countOnly) {
      console.log(rows.length)
      return
    }

    if (asCsv) {
      console.log('email,createdAt')
      for (const r of rows) console.log(`${r.email},${new Date(r.createdAt).toISOString()}`)
      return
    }

    if (rows.length === 0) {
      console.log('No signups yet.')
      return
    }

    console.log(`\n${rows.length} waitlist signup${rows.length === 1 ? '' : 's'} (newest first):\n`)
    for (const r of rows) {
      const when = new Date(r.createdAt).toLocaleString()
      console.log(`  ${r.email.padEnd(36)}  ${when}`)
    }
    console.log('')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Failed to read waitlist:', err.message)
  process.exit(1)
})
