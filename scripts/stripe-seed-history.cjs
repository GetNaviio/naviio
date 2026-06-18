/**
 * Seed Stripe TEST data WITH MONTHS OF HISTORY using a Test Clock, so the
 * dashboard's trend charts, MRR movement, and YTD-vs-last-year card have real
 * curves to render — not just a single current month.
 *
 * Stripe won't let you backdate a charge, so the only honest way to manufacture
 * history is a Test Clock: create customers + subscriptions at a frozen past
 * time, then advance the clock month by month so Stripe generates real,
 * properly-dated invoices/charges at each billing cycle. We also stage growth
 * (new customers over time), an upgrade, a downgrade, and a couple of churns.
 *
 * Run once on your machine (TEST key only — it refuses a live key):
 *   node scripts/stripe-seed-history.cjs           # 9 months (default)
 *   node scripts/stripe-seed-history.cjs 6          # 6 months
 *
 * Then connect THIS sandbox account in Naviio and sync. Each advance is async,
 * so the script polls Stripe between steps; expect it to take a minute or two.
 */
const fs = require('fs');
const path = require('path');

// Load env from the first matching dotenv file (Next.js uses .env.local), and
// let an inline STRIPE_SECRET_KEY=... win over the file.
const env = {};
for (const name of ['.env.local', '.env', '.env.save']) {
  const p = path.join(__dirname, '..', name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || '';
if (!KEY.startsWith('sk_test_')) {
  console.error('Refusing to run: STRIPE_SECRET_KEY must be a TEST key (sk_test_...).');
  process.exit(1);
}
const stripe = require('stripe')(KEY, { apiVersion: '2026-04-22.dahlia' });

const MONTHS = Math.max(3, Math.min(12, parseInt(process.argv[2] || '9', 10) || 9));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLANS = [
  { name: 'Naviio Starter', amount: 4900 },
  { name: 'Naviio Growth', amount: 14900 },
  { name: 'Naviio Pro', amount: 39900 },
];
const NAMES = [
  'Acme Inc', 'Globex', 'Initech', 'Umbrella Co', 'Hooli', 'Wayne Co', 'Stark LLC',
  'Wonka Foods', 'Cyberdyne', 'Soylent Corp', 'Tyrell Corp', 'Gekko & Co', 'Pied Piper', 'Vandelay',
];

/** First of the month, `offset` months from now, at noon UTC (stable billing anchor). */
function firstOfMonthUTC(offset) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d;
}

async function waitReady(clockId) {
  const deadline = Date.now() + 120000;
  for (;;) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === 'ready') return;
    if (c.status === 'internal_failure') throw new Error('test clock advance hit an internal failure');
    if (Date.now() > deadline) throw new Error('timed out waiting for the test clock to settle');
    await sleep(2500);
  }
}

async function advanceTo(clockId, date) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: Math.floor(date.getTime() / 1000) });
  await waitReady(clockId);
}

// Stripe caps a single test clock at 3 customers, so we use one clock per
// "cohort" of ≤3 customers, each joining at a different past month. Staggered
// start dates give a natural customer-growth curve, and each clock generates its
// own dated monthly invoices as we advance it to today.
const MAX_PER_CLOCK = 3;

(async () => {
  console.log(`Seeding ~${MONTHS} months of Stripe history via staggered Test Clocks…`);

  // Prices (not tied to a clock).
  const prices = [];
  for (const p of PLANS) {
    const product = await stripe.products.create({ name: p.name });
    const price = await stripe.prices.create({
      product: product.id, unit_amount: p.amount, currency: 'usd', recurring: { interval: 'month' },
    });
    prices.push(price);
  }
  console.log('  created 3 subscription tiers ($49 / $149 / $399 per month)');

  let nameIdx = 0;
  const allSubs = []; // { id, itemId, name }

  async function addCustomer(clockId, tier) {
    const base = NAMES[nameIdx % NAMES.length];
    const suffix = nameIdx >= NAMES.length ? ` ${Math.floor(nameIdx / NAMES.length) + 1}` : '';
    const name = base + suffix;
    nameIdx++;
    const customer = await stripe.customers.create({ name, email: `ar${nameIdx}@example.test`, test_clock: clockId });
    const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices[tier].id }] });
    allSubs.push({ id: sub.id, itemId: sub.items.data[0].id, name });
  }

  // Cohorts: when they join (months ago) and which tiers (≤ MAX_PER_CLOCK each).
  const cohorts = [
    { offset: -MONTHS, tiers: [0, 1, 2] },
    { offset: -Math.round((MONTHS * 2) / 3), tiers: [0, 1, 0] },
    { offset: -Math.round(MONTHS / 3), tiers: [1, 2, 0] },
  ];

  for (const cohort of cohorts) {
    const startOff = Math.max(-MONTHS, cohort.offset);
    const start = firstOfMonthUTC(startOff);
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(start.getTime() / 1000),
      name: `Naviio cohort ${start.toISOString().slice(0, 7)}`,
    });
    console.log(`  cohort joining ${start.toISOString().slice(0, 7)} (${clock.id})`);
    for (const t of cohort.tiers.slice(0, MAX_PER_CLOCK)) await addCustomer(clock.id, t);
    // Advance this clock month-by-month to the present, generating invoices.
    for (let off = startOff + 1; off <= 0; off++) await advanceTo(clock.id, firstOfMonthUTC(off));
    await advanceTo(clock.id, new Date()); // settle the current partial month
    console.log(`    advanced ${-startOff} months to today`);
  }

  // A couple of churns + an upgrade so movement/NRR have signal.
  let churned = 0;
  if (allSubs.length >= 5) {
    await stripe.subscriptions.cancel(allSubs[0].id);
    await stripe.subscriptions.cancel(allSubs[4].id);
    churned = 2;
    await stripe.subscriptions.update(allSubs[1].id, {
      items: [{ id: allSubs[1].itemId, price: prices[2].id }], proration_behavior: 'create_prorations',
    });
    console.log('  applied 2 churns + 1 upgrade');
  }

  console.log(`\nDone. Seeded ${allSubs.length} customers across ${cohorts.length} cohorts.`);
  console.log(`  ${allSubs.length - churned} active subscriptions, ${churned} churned.`);
  console.log('  Connect THIS sandbox account in Naviio, then Sync Now to pull it in.');
})().catch((e) => {
  console.error('Seed failed:', e?.raw?.message || e.message);
  process.exit(1);
});
