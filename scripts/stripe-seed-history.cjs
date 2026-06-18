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

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = env.STRIPE_SECRET_KEY || '';
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

(async () => {
  console.log(`Seeding ${MONTHS} months of Stripe history via a Test Clock…`);

  // Prices (not tied to the clock).
  const prices = [];
  for (const p of PLANS) {
    const product = await stripe.products.create({ name: p.name });
    const price = await stripe.prices.create({
      product: product.id, unit_amount: p.amount, currency: 'usd', recurring: { interval: 'month' },
    });
    prices.push(price);
  }
  console.log('  created 3 subscription tiers ($49 / $149 / $399 per month)');

  const start = firstOfMonthUTC(-MONTHS);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(start.getTime() / 1000),
    name: `Naviio seed ${new Date().toISOString().slice(0, 10)}`,
  });
  console.log(`  test clock starts ${start.toISOString().slice(0, 10)} (${clock.id})`);

  const subs = []; // { id, itemId, name, canceled?, changed? }
  let nameIdx = 0;

  async function addCustomer(tier) {
    const base = NAMES[nameIdx % NAMES.length];
    const suffix = nameIdx >= NAMES.length ? ` ${Math.floor(nameIdx / NAMES.length) + 1}` : '';
    const name = base + suffix;
    nameIdx++;
    const customer = await stripe.customers.create({ name, email: `ar${nameIdx}@example.test`, test_clock: clock.id });
    // Robust for test clocks: mint a PaymentMethod from a test token and attach it.
    const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: prices[tier].id }] });
    subs.push({ id: sub.id, itemId: sub.items.data[0].id, name });
    return name;
  }
  async function churnOne() {
    const s = subs.find((x) => !x.canceled);
    if (!s) return null;
    await stripe.subscriptions.cancel(s.id);
    s.canceled = true;
    return s.name;
  }
  async function changeTier(toTier) {
    const s = subs.find((x) => !x.canceled && !x.changed);
    if (!s) return null;
    await stripe.subscriptions.update(s.id, {
      items: [{ id: s.itemId, price: prices[toTier].id }], proration_behavior: 'create_prorations',
    });
    s.changed = true;
    return s.name;
  }

  // Month-0 cohort (mixed tiers).
  for (const t of [0, 1, 2, 0, 1, 0]) await addCustomer(t);
  console.log(`  ${start.toISOString().slice(0, 7)}: 6 customers subscribed`);

  // What happens at each subsequent month index (skipped if beyond MONTHS).
  const schedule = {
    2: async () => { await addCustomer(1); await addCustomer(0); console.log('    +2 new customers'); },
    3: async () => { const n = await changeTier(1); console.log(`    upgraded ${n} → Growth`); },
    4: async () => { await addCustomer(2); await addCustomer(0); console.log('    +2 new customers'); },
    5: async () => { const n = await churnOne(); console.log(`    churned ${n}`); },
    6: async () => { const n = await changeTier(1); await addCustomer(1); console.log(`    downgraded ${n} → Growth, +1 customer`); },
    7: async () => { await addCustomer(0); console.log('    +1 new customer'); },
    8: async () => { const n = await churnOne(); console.log(`    churned ${n}`); },
  };

  for (let i = 1; i <= MONTHS; i++) {
    const target = firstOfMonthUTC(-MONTHS + i);
    await advanceTo(clock.id, target);
    console.log(`  → advanced to ${target.toISOString().slice(0, 7)}`);
    if (schedule[i]) await schedule[i]();
  }
  // Settle the current partial month so this month's invoices exist too.
  await advanceTo(clock.id, new Date());

  const active = subs.filter((s) => !s.canceled).length;
  console.log(`\nDone. ${MONTHS} months of history on test clock ${clock.id}.`);
  console.log(`  ${active} active subscriptions, ${subs.length - active} churned.`);
  console.log('  Connect THIS sandbox account in Naviio, then sync to pull it in.');
})().catch((e) => {
  console.error('Seed failed:', e?.raw?.message || e.message);
  process.exit(1);
});
