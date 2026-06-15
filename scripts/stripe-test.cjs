/**
 * Stripe API test — run locally where Stripe is reachable.
 *
 *   node scripts/stripe-test.cjs
 *
 * Verifies your STRIPE_SECRET_KEY works and exercises the same reads the app
 * uses: account, balance, subscriptions (→ MRR), charges, customers. No DB,
 * no webhook needed. Never prints the full key.
 */
const fs = require('fs')
const path = require('path')

const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const KEY = env.STRIPE_SECRET_KEY

console.log('STRIPE_SECRET_KEY:', KEY ? `${KEY.slice(0, 8)}… (${KEY.startsWith('sk_test_') ? 'TEST mode' : KEY.startsWith('sk_live_') ? 'LIVE mode' : 'unknown format'})` : '(EMPTY!)')
if (!KEY) {
  console.error('\n✗ No STRIPE_SECRET_KEY in .env. Paste your test secret key (sk_test_…) and retry.')
  process.exit(1)
}

const Stripe = require('stripe')
const stripe = new Stripe(KEY, { apiVersion: '2026-04-22.dahlia' })

const detail = (e) => (e && e.raw && e.raw.message) || (e && e.message) || 'unknown error'

;(async () => {
  // 1) Auth check — who am I?
  try {
    const acct = await stripe.accounts.retrieve()
    console.log('\n✓ [1] auth OK — account:', acct.id, acct.business_profile?.name ? `(${acct.business_profile.name})` : '')
  } catch (e) {
    console.log('\n✗ [1] auth FAILED →', detail(e))
    console.log('  → The key is wrong, revoked, or for the wrong mode. Grab the Test-mode secret key from Developers → API keys.')
    process.exit(0)
  }

  // 2) Balance
  try {
    const bal = await stripe.balance.retrieve()
    const avail = (bal.available || []).map((b) => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ')
    console.log('✓ [2] balance/retrieve OK — available:', avail || '(none)')
  } catch (e) {
    console.log('✗ [2] balance/retrieve →', detail(e))
  }

  // 3) Subscriptions → MRR (same math as the app)
  try {
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    const mrrCents = subs.data.reduce((sum, sub) =>
      sum + sub.items.data.reduce((s, item) => {
        const amt = item.price.unit_amount || 0
        const qty = item.quantity || 1
        return s + (item.price.recurring?.interval === 'year' ? (amt * qty) / 12 : amt * qty)
      }, 0), 0)
    const mrr = mrrCents / 100
    console.log(`✓ [3] subscriptions OK — ${subs.data.length} active | MRR $${mrr.toFixed(2)} | ARR $${(mrr * 12).toFixed(2)}`)
  } catch (e) {
    console.log('✗ [3] subscriptions/list →', detail(e))
  }

  // 4) Charges (last 30 days)
  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400
    const charges = await stripe.charges.list({ created: { gte: since }, limit: 100 })
    const gross = charges.data.filter((c) => c.paid && !c.refunded).reduce((s, c) => s + c.amount, 0) / 100
    console.log(`✓ [4] charges OK — ${charges.data.length} in last 30d | gross $${gross.toFixed(2)}`)
  } catch (e) {
    console.log('✗ [4] charges/list →', detail(e))
  }

  // 5) Customers
  try {
    const customers = await stripe.customers.list({ limit: 100 })
    console.log(`✓ [5] customers OK — ${customers.data.length}${customers.has_more ? '+' : ''}`)
  } catch (e) {
    console.log('✗ [5] customers/list →', detail(e))
  }

  console.log('\n✓ Stripe API is reachable and the key works. If counts are 0, your test account just has no data yet — create some test subscriptions/charges in the Stripe dashboard.')
})()
