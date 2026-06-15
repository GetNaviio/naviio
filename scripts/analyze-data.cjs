/**
 * One-off data analysis: summarizes what's in the Transaction table so we can
 * sanity-check the dashboard metric cards. Reads DATABASE_URL from .env.
 *   Run:  node scripts/analyze-data.cjs
 */
const fs = require('fs')
const { Client } = require('pg')

const env = fs.readFileSync('.env', 'utf8')
const m = env.match(/^DATABASE_URL=(.*)$/m)
if (!m) { console.error('No DATABASE_URL in .env'); process.exit(1) }
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  const q = async (sql) => (await client.query(sql)).rows

  const integ = await q(`select provider, status, "lastSyncedAt", "newAccountsAvailable" from "Integration" order by provider`)
  const range = await q(`select min(date) as earliest, max(date) as latest, count(*)::int as txns from "Transaction"`)
  const bySrc = await q(`select source, "type", count(*)::int as n, round(sum(amount)::numeric,2) as total
                         from "Transaction" group by source, "type" order by source, "type"`)
  const byMonth = await q(`select to_char(date,'YYYY-MM') as month,
                             round(sum(case when "type"='CREDIT' then amount else 0 end)::numeric,2) as credits,
                             round(sum(case when "type"='DEBIT' then amount else 0 end)::numeric,2) as debits,
                             count(*)::int as n
                           from "Transaction" group by 1 order by 1`)
  const topCat = await q(`select coalesce(category,'(uncategorized)') as category, count(*)::int as n,
                            round(sum(amount)::numeric,2) as total
                          from "Transaction" group by 1 order by total desc limit 15`)

  console.log('\n=== INTEGRATIONS ===');            console.table(integ)
  console.log('=== DATE RANGE / COUNT ===');        console.table(range)
  console.log('=== BY SOURCE & TYPE ===');          console.table(bySrc)
  console.log('=== MONTHLY CREDITS vs DEBITS ===');  console.table(byMonth)
  console.log('=== TOP CATEGORIES (by $) ===');     console.table(topCat)

  await client.end()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
