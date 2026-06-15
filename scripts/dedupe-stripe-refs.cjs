/**
 * One-off cleanup: remove duplicate CreditLedgerEntry rows that share a stripeRef
 * (left over from the pre-fix double-credit race), keeping the earliest per ref.
 * Run BEFORE `npx prisma db push` adds the unique index on stripeRef.
 *
 *   node scripts/dedupe-stripe-refs.cjs
 *
 * Safe to run repeatedly; it only deletes true duplicates. NULL stripeRefs
 * (charges/refunds/grants) are never touched.
 */
const { Client } = require('pg')
const fs = require('fs')

const line = fs.readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))
if (!line) { console.error('DATABASE_URL not found in .env'); process.exit(1) }
const dsn = line.replace('DATABASE_URL=', '').replace(/^["']|["']$/g, '').trim()

;(async () => {
  const c = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const dupes = await c.query(
    `SELECT "stripeRef", COUNT(*) AS n FROM "CreditLedgerEntry"
     WHERE "stripeRef" IS NOT NULL GROUP BY "stripeRef" HAVING COUNT(*) > 1`
  )
  if (dupes.rowCount === 0) {
    console.log('No duplicate stripeRef rows — safe to run `npx prisma db push`.')
  } else {
    const del = await c.query(
      `DELETE FROM "CreditLedgerEntry"
       WHERE "stripeRef" IS NOT NULL
         AND id NOT IN (
           SELECT MIN(id) FROM "CreditLedgerEntry"
           WHERE "stripeRef" IS NOT NULL GROUP BY "stripeRef"
         )`
    )
    console.log(`Removed ${del.rowCount} duplicate purchase row(s) across ${dupes.rowCount} ref(s). Now run \`npx prisma db push\`.`)
  }
  await c.end()
})().catch((e) => { console.error('Error:', e.message); process.exit(1) })
