/**
 * Create the Stripe Prices for Naviio's individual (direct-to-customer) plans —
 * Starter / Growth / Pro / CFO Suite, monthly + annual — on the account your
 * STRIPE_SECRET_KEY points to. Run once per mode (test, then live).
 *
 *   node scripts/stripe-plan-prices.cjs
 *
 * Flat recurring prices (no tiers — these are per-org plan fees, not per-seat).
 * Idempotent: looked up by lookup_key and reused. Prints env lines to paste.
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
  console.error('STRIPE_SECRET_KEY not found (checked env + .env.local/.env/.env.save).')
  process.exit(1)
}
const mode = KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'
const stripe = require('stripe')(KEY, { apiVersion: '2026-04-22.dahlia' })
const ANNUAL_MULT = 10
const ENTITY_OVERAGE = 9900 // $99/entity/mo

// [planId, label, monthlyCents, includedEntities]
//   Starter/Growth: single-entity, flat price.
//   Pro/CFO: graduated tiered on entity count (quantity = number of own entities):
//            tier 1 flat base covers the included entities, tier 2 $99/entity.
//   CFO Suite (direct, $99 overage) is distinct from the fractional-CFO FIRM
//   white-label price ($59 overage, scripts/stripe-firm-prices.cjs).
const PLANS = [
  ['STARTER', 'Naviio Starter', 4900, 1],
  ['GROWTH', 'Naviio Growth', 14900, 1],
  ['PRO', 'Naviio Pro', 34900, 3],
  ['CFO', 'Naviio CFO Suite', 79900, 10],
]

async function ensureProduct(planId, name) {
  const found = await stripe.products
    .search({ query: `metadata['naviioPlan']:'${planId}'` })
    .catch(() => ({ data: [] }))
  if (found.data && found.data[0]) return found.data[0]
  return stripe.products.create({ name, metadata: { naviioPlan: planId } })
}

async function ensureFlatPrice(productId, lookupKey, interval, amount) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 }).catch(() => ({ data: [] }))
  if (existing.data && existing.data[0]) return existing.data[0]
  return stripe.prices.create({
    product: productId,
    currency: 'usd',
    lookup_key: lookupKey,
    nickname: lookupKey,
    unit_amount: amount,
    recurring: { interval },
  })
}

async function ensureTieredPrice(productId, lookupKey, interval, baseCents, includedEntities, overageCents) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 }).catch(() => ({ data: [] }))
  if (existing.data && existing.data[0]) return existing.data[0]
  return stripe.prices.create({
    product: productId,
    currency: 'usd',
    lookup_key: lookupKey,
    nickname: lookupKey,
    recurring: { interval, usage_type: 'licensed' },
    billing_scheme: 'tiered',
    tiers_mode: 'graduated',
    tiers: [
      { up_to: includedEntities, unit_amount: 0, flat_amount: baseCents },
      { up_to: 'inf', unit_amount: overageCents },
    ],
  })
}

;(async () => {
  console.log(`Creating Naviio plan prices in ${mode} mode…\n`)
  const lines = []
  for (const [planId, name, monthly, included] of PLANS) {
    const product = await ensureProduct(planId, name)
    const multiEntity = included > 1
    let m, a
    if (multiEntity) {
      m = await ensureTieredPrice(product.id, `plan_${planId.toLowerCase()}_monthly`, 'month', monthly, included, ENTITY_OVERAGE)
      a = await ensureTieredPrice(product.id, `plan_${planId.toLowerCase()}_annual`, 'year', monthly * ANNUAL_MULT, included, ENTITY_OVERAGE * ANNUAL_MULT)
    } else {
      m = await ensureFlatPrice(product.id, `plan_${planId.toLowerCase()}_monthly`, 'month', monthly)
      a = await ensureFlatPrice(product.id, `plan_${planId.toLowerCase()}_annual`, 'year', monthly * ANNUAL_MULT)
    }
    const tag = multiEntity ? ` (incl ${included} entities, +$${ENTITY_OVERAGE / 100}/entity)` : ''
    console.log(`  ${name.padEnd(20)} monthly ${m.id}  annual ${a.id}${tag}`)
    lines.push(`STRIPE_PLAN_PRICE_${planId}_MONTHLY=${m.id}`)
    lines.push(`STRIPE_PLAN_PRICE_${planId}_ANNUAL=${a.id}`)
  }
  console.log('\nAdd these to .env.local (and Vercel for prod):\n')
  console.log(lines.join('\n'))
  console.log('')
})().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})
