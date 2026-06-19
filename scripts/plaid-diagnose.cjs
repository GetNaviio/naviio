/**
 * Diagnose Plaid link-token failures from the command line — bypasses the app/UI
 * and calls Plaid directly with your .env.local credentials, printing the exact
 * error so we know whether it's keys, env mismatch, redirect_uri, etc.
 *
 *   node scripts/plaid-diagnose.cjs
 */
const fs = require('fs')
const path = require('path')

const env = {}
for (const name of ['.env.local', '.env', '.env.save']) {
  const p = path.join(__dirname, '..', name)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const ENV = env.PLAID_ENV || 'sandbox'
const ID = env.PLAID_CLIENT_ID || ''
const SECRET = env.PLAID_SECRET || ''
console.log('— config —')
console.log('  PLAID_ENV          :', ENV)
console.log('  PLAID_CLIENT_ID    :', ID ? `set (len ${ID.length}, ${ID.slice(0, 6)}…)` : 'MISSING')
console.log('  PLAID_SECRET       :', SECRET ? `set (len ${SECRET.length})` : 'MISSING')
console.log('  PLAID_REDIRECT_URI :', env.PLAID_REDIRECT_URI || '(blank)')
console.log('  PLAID_WEBHOOK_URL  :', env.PLAID_WEBHOOK_URL || '(blank)')

const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid')
if (!PlaidEnvironments[ENV]) {
  console.error(`\nPLAID_ENV "${ENV}" is invalid — must be one of: ${Object.keys(PlaidEnvironments).join(', ')}`)
  process.exit(1)
}
const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[ENV],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': ID, 'PLAID-SECRET': SECRET } },
  }),
)

async function attempt(label, body) {
  try {
    const res = await client.linkTokenCreate(body)
    console.log(`\n[${label}] ✅ OK — link_token created (${String(res.data.link_token).slice(0, 12)}…)`)
    return true
  } catch (e) {
    const d = e.response && e.response.data ? e.response.data : null
    console.log(`\n[${label}] ❌ FAILED`)
    if (d) {
      console.log('  error_type   :', d.error_type)
      console.log('  error_code   :', d.error_code)
      console.log('  error_message:', d.error_message)
      if (d.causes) console.log('  causes       :', JSON.stringify(d.causes))
    } else {
      console.log('  network/other:', e.message, e.code ? `(${e.code})` : '')
    }
    return false
  }
}

;(async () => {
  const base = {
    user: { client_user_id: 'diagnose' },
    client_name: 'Naviio',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  }
  // 1) Minimal call (no redirect/webhook) — isolates keys/env problems.
  await attempt('minimal', base)
  // 2) With redirect_uri + webhook if set — isolates registration mismatches.
  if (env.PLAID_REDIRECT_URI || env.PLAID_WEBHOOK_URL) {
    await attempt('with redirect/webhook', {
      ...base,
      redirect_uri: env.PLAID_REDIRECT_URI || undefined,
      webhook: env.PLAID_WEBHOOK_URL || undefined,
    })
  }
  console.log('')
})()
