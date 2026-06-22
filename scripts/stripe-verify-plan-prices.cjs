/**
 * Verify what each STRIPE_PLAN_PRICE_* env var actually points to in Stripe —
 * amount (or tiers), product name, and active flag. Read-only; makes no changes.
 *
 *   node scripts/stripe-verify-plan-prices.cjs
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
const KEY = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || ''
if (!KEY.startsWith('sk_')) {
  console.error('STRIPE_SECRET_KEY not found.')
  process.exit(1)
}
const mode = KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'
const stripe = require('stripe')(KEY, { apiVersion: '2026-04-22.dahlia' })

const VARS = [
  'STRIPE_PLAN_PRICE_STARTER_MONTHLY', 'STRIPE_PLAN_PRICE_STARTER_ANNUAL',
  'STRIPE_PLAN_PRICE_GROWTH_MONTHLY', 'STRIPE_PLAN_PRICE_GROWTH_ANNUAL',
  'STRIPE_PLAN_PRICE_PRO_MONTHLY', 'STRIPE_PLAN_PRICE_PRO_ANNUAL',
  'STRIPE_PLAN_PRICE_CFO_MONTHLY', 'STRIPE_PLAN_PRICE_CFO_ANNUAL',
]
const money = (c) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)

;(async () => {
  console.log(`Verifying plan prices in ${mode} mode…\n`)
  for (const v of VARS) {
    const id = env[v]
    if (!id) { console.log(`${v.padEnd(38)} (not set)`); continue }
    try {
      const p = await stripe.prices.retrieve(id, { expand: ['product', 'tiers'] })
      let shape
      if (p.billing_scheme === 'tiered' && p.tiers) {
        const t0 = p.tiers[0], t1 = p.tiers[1]
        shape = `tiered base ${money(t0?.flat_amount)} (up to ${t0?.up_to}) then ${money(t1?.unit_amount)}/unit`
      } else {
        shape = `flat ${money(p.unit_amount)}`
      }
      const prod = typeof p.product === 'object' ? p.product.name : p.product
      console.log(`${v.padEnd(38)} ${shape}  · ${p.recurring?.interval}  · "${prod}"  · ${p.active ? 'active' : 'ARCHIVED'}  · ${id}`)
    } catch (e) {
      console.log(`${v.padEnd(38)} ERROR: ${e.message}  · ${id}`)
    }
  }
  console.log('')
})().catch((e) => { console.error('Failed:', e.message); process.exit(1) })
