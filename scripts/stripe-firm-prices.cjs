/**
 * Create the Stripe Prices for the two firm GTM plans, on the Stripe account your
 * STRIPE_SECRET_KEY points to (run once per mode — test and live have separate IDs).
 *
 *   node scripts/stripe-firm-prices.cjs
 *
 * Each plan/cycle is a single GRADUATED TIERED price keyed on the firm's client-org
 * count (the subscription quantity): tier 1 is a flat base covering the included
 * orgs, tier 2 charges $59/org beyond that. So quantity = number of client orgs and
 * Stripe computes base + overage automatically — matching lib/firm/billing.ts.
 *
 * Idempotent: prices are looked up by lookup_key and reused if they already exist.
 * Prints the env lines to paste into .env.local / Vercel.
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

const ANNUAL_MULT = 10 // annual = pay for 10 months (2 months free)

// [envVar, lookup_key, interval, includedOrgs, baseMonthlyCents, overageMonthlyCents]
const PRICES = [
  ['STRIPE_FIRM_PRICE_WL_MONTHLY', 'firm_white_label_monthly', 'month', 10, 79900, 5900],
  ['STRIPE_FIRM_PRICE_WL_ANNUAL', 'firm_white_label_annual', 'year', 10, 79900 * ANNUAL_MULT, 5900 * ANNUAL_MULT],
  ['STRIPE_FIRM_PRICE_WLSAAS_MONTHLY', 'firm_white_label_saas_monthly', 'month', 25, 99700, 5900],
  ['STRIPE_FIRM_PRICE_WLSAAS_ANNUAL', 'firm_white_label_saas_annual', 'year', 25, 99700 * ANNUAL_MULT, 5900 * ANNUAL_MULT],
]

async function ensureProduct() {
  const found = await stripe.products.search({ query: "metadata['naviioFirm']:'platform'" }).catch(() => ({ data: [] }))
  if (found.data && found.data[0]) return found.data[0]
  return stripe.products.create({
    name: 'Naviio — Firm Platform',
    description: 'Fractional-CFO firm platform subscription (base + per-client-org overage).',
    metadata: { naviioFirm: 'platform' },
  })
}

async function ensurePrice(productId, lookupKey, interval, includedOrgs, baseCents, overageCents) {
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
      { up_to: includedOrgs, unit_amount: 0, flat_amount: baseCents },
      { up_to: 'inf', unit_amount: overageCents },
    ],
    expand: [],
  })
}

;(async () => {
  console.log(`Creating Naviio firm prices in ${mode} mode…\n`)
  const product = await ensureProduct()
  const lines = []
  for (const [envVar, lookupKey, interval, included, base, overage] of PRICES) {
    const price = await ensurePrice(product.id, lookupKey, interval, included, base, overage)
    console.log(`  ${lookupKey.padEnd(34)} ${price.id}  ($${base / 100}/${interval}, +$${overage / 100}/org after ${included})`)
    lines.push(`${envVar}=${price.id}`)
  }
  console.log('\nAdd these to .env.local (and Vercel for prod):\n')
  console.log(lines.join('\n'))
  console.log('')
})().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})
