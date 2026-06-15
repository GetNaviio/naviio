/**
 * Plaid sandbox integration test — run locally where Plaid is reachable.
 *
 *   node scripts/plaid-sandbox-test.cjs
 *
 * Exercises the whole data path without a browser or the database:
 *   1. /link/token/create  (with redirect_uri — mirrors the app)
 *   1b. retry without redirect_uri to isolate redirect_uri problems
 *   2. /sandbox/public_token/create → /item/public_token/exchange
 *   3. /accounts/balance/get
 *   4. /transactions/sync   (with light retry — sandbox needs a moment)
 *   5. validate the same mapping the app persists
 *
 * Reads PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV / PLAID_REDIRECT_URI from .env.
 * Never prints secrets.
 */
const fs = require('fs')
const path = require('path')

const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, PLAID_REDIRECT_URI } = env

console.log('PLAID_ENV    =', PLAID_ENV)
console.log('CLIENT_ID    =', PLAID_CLIENT_ID ? PLAID_CLIENT_ID.slice(0, 6) + '…' : '(EMPTY!)')
console.log('SECRET set   =', !!PLAID_SECRET)
console.log('REDIRECT_URI =', PLAID_REDIRECT_URI || '(none)')
if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('\n✗ Missing credentials in .env — fill them in and retry.')
  process.exit(1)
}

const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid')
const client = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV || 'sandbox'],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': PLAID_CLIENT_ID, 'PLAID-SECRET': PLAID_SECRET } },
  }),
)

const detail = (e) => {
  const d = e.response && e.response.data
  if (d && (d.error_code || d.error_message)) return `${d.error_type} | ${d.error_code} | ${d.error_message}`
  return e.code || e.message || 'unknown error'
}

;(async () => {
  // 1) reproduce the app's link/token/create
  try {
    const r = await client.linkTokenCreate({
      user: { client_user_id: 'test-org' },
      client_name: 'Naviio',
      products: [Products.Transactions, Products.Auth],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: PLAID_REDIRECT_URI || undefined,
    })
    console.log('\n✓ [1] link/token/create (with redirect_uri):', r.data.link_token.slice(0, 18) + '…')
  } catch (e) {
    console.log('\n✗ [1] link/token/create (with redirect_uri):', detail(e))
    try {
      const r2 = await client.linkTokenCreate({
        user: { client_user_id: 'test-org' },
        client_name: 'Naviio',
        products: [Products.Transactions, Products.Auth],
        country_codes: [CountryCode.Us],
        language: 'en',
      })
      console.log('  ✓ [1b] WITHOUT redirect_uri works:', r2.data.link_token.slice(0, 18) + '…')
      console.log('  → redirect_uri is the problem: register it under Developers → API →')
      console.log('    Allowed redirect URIs, exact match (https, no trailing slash).')
    } catch (e2) {
      console.log('  ✗ [1b] WITHOUT redirect_uri also fails:', detail(e2))
      console.log('  → credentials/env issue (check PLAID_ENV matches the secret, server restarted).')
    }
  }

  // 2-5) full sandbox data path
  try {
    const pt = await client.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: [Products.Transactions],
    })
    const ex = await client.itemPublicTokenExchange({ public_token: pt.data.public_token })
    const access = ex.data.access_token
    console.log('\n✓ [2] sandbox public_token → exchange: item', ex.data.item_id)

    const bal = await client.accountsBalanceGet({ access_token: access })
    const cash = bal.data.accounts.reduce((s, a) => s + (a.balances.current || 0), 0)
    console.log('✓ [3] accounts/balance/get:', bal.data.accounts.length, 'accounts, total current =', cash)

    let cursor, tries = 0
    const added = []
    while (tries < 8) {
      const s = await client.transactionsSync({ access_token: access, cursor })
      added.push(...s.data.added)
      cursor = s.data.next_cursor
      if (!s.data.has_more) {
        if (added.length || tries >= 3) break
        await new Promise((r) => setTimeout(r, 2000))
      }
      tries++
    }
    console.log('✓ [4] transactions/sync:', added.length, 'transactions pulled')

    if (added.length) {
      const t = added[0]
      const mapped = {
        externalId: t.transaction_id,
        amount: Math.abs(t.amount),
        type: t.amount >= 0 ? 'DEBIT' : 'CREDIT',
        currency: t.iso_currency_code ?? t.unofficial_currency_code ?? 'USD',
        category: t.personal_finance_category?.primary ?? (t.category && t.category[0]) ?? null,
        merchantName: t.merchant_name ?? null,
        description: t.name,
      }
      console.log('✓ [5] mapped sample:', JSON.stringify(mapped))
    }
    console.log('\n✓ Sandbox data path works end to end.')
  } catch (e) {
    console.log('\n✗ [2-5] sandbox data path failed:', detail(e))
  }
})()
