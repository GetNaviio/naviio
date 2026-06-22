/**
 * Tidy the Stripe catalog for the individual plans: keep ONLY the products +
 * prices referenced by your STRIPE_PLAN_PRICE_* env vars, archive the rest
 * (the duplicate "Naviio Pro/Growth/Starter/CFO Suite" products and stray
 * prices left over from earlier script runs).
 *
 *   node scripts/stripe-cleanup-plan-products.cjs           # DRY RUN (prints plan, no changes)
 *   node scripts/stripe-cleanup-plan-products.cjs --apply   # actually archive
 *
 * Scope guard: only ever touches products whose name is one of the four plan
 * names below OR that carry metadata.naviioPlan. Firm / white-label products,
 * credits, and everything else are left untouched. Archiving is reversible in
 * Stripe (set active=true again); nothing is deleted.
 */
const fs = require('fs')
const path = require('path')

const APPLY = process.argv.includes('--apply')

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
if (!KEY.startsWith('sk_')) { console.error('STRIPE_SECRET_KEY not found.'); process.exit(1) }
const mode = KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'
const stripe = require('stripe')(KEY, { apiVersion: '2026-04-22.dahlia' })

const PLAN_NAMES = new Set(['Naviio Starter', 'Naviio Growth', 'Naviio Pro', 'Naviio CFO Suite'])
const ENV_VARS = [
  'STRIPE_PLAN_PRICE_STARTER_MONTHLY', 'STRIPE_PLAN_PRICE_STARTER_ANNUAL',
  'STRIPE_PLAN_PRICE_GROWTH_MONTHLY', 'STRIPE_PLAN_PRICE_GROWTH_ANNUAL',
  'STRIPE_PLAN_PRICE_PRO_MONTHLY', 'STRIPE_PLAN_PRICE_PRO_ANNUAL',
  'STRIPE_PLAN_PRICE_CFO_MONTHLY', 'STRIPE_PLAN_PRICE_CFO_ANNUAL',
]

const isPlanProduct = (p) => PLAN_NAMES.has(p.name) || !!(p.metadata && p.metadata.naviioPlan)

;(async () => {
  console.log(`Catalog cleanup in ${mode} mode — ${APPLY ? 'APPLYING CHANGES' : 'DRY RUN (no changes)'}\n`)

  // 1) The price IDs we keep, and the products they live on.
  const keepPriceIds = new Set()
  const keepProductIds = new Set()
  const defaultByProduct = {} // productId -> a monthly price id to use as default
  for (const v of ENV_VARS) {
    const id = env[v]
    if (!id) { console.warn(`! ${v} not set — skipping`); continue }
    try {
      const price = await stripe.prices.retrieve(id)
      keepPriceIds.add(price.id)
      const prod = typeof price.product === 'string' ? price.product : price.product.id
      keepProductIds.add(prod)
      if (v.endsWith('_MONTHLY')) defaultByProduct[prod] = price.id
    } catch (e) {
      console.error(`! ${v} (${id}) could not be retrieved: ${e.message}`)
    }
  }
  console.log(`Keeping ${keepPriceIds.size} prices across ${keepProductIds.size} products.\n`)

  let archivedProducts = 0, archivedPrices = 0

  // 2) Walk every plan product.
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (!isPlanProduct(product)) continue

    if (!keepProductIds.has(product.id)) {
      // Duplicate / unreferenced plan product → archive whole product.
      console.log(`${product.active ? 'ARCHIVE' : 'already archived'} product  "${product.name}"  ${product.id}`)
      if (APPLY && product.active) {
        await stripe.products.update(product.id, { active: false }).catch((e) => console.error(`  ! ${e.message}`))
      }
      archivedProducts++
      continue
    }

    // Kept product: archive any stray prices that aren't our env IDs.
    for await (const price of stripe.prices.list({ product: product.id, limit: 100 })) {
      if (keepPriceIds.has(price.id) || !price.active) continue
      console.log(`ARCHIVE price    ${price.id}  on kept "${product.name}"`)
      if (APPLY) {
        try {
          await stripe.prices.update(price.id, { active: false })
        } catch (e) {
          // Can't archive a product's default price — repoint default first.
          if (/default price/i.test(e.message) && defaultByProduct[product.id]) {
            await stripe.products.update(product.id, { default_price: defaultByProduct[product.id] }).catch(() => {})
            await stripe.prices.update(price.id, { active: false }).catch((e2) => console.error(`  ! ${e2.message}`))
          } else {
            console.error(`  ! ${e.message}`)
          }
        }
      }
      archivedPrices++
    }
  }

  console.log(`\n${APPLY ? 'Archived' : 'Would archive'}: ${archivedProducts} products, ${archivedPrices} stray prices.`)
  if (!APPLY) console.log('Re-run with --apply to make the changes.')
})().catch((e) => { console.error('Failed:', e.message); process.exit(1) })
