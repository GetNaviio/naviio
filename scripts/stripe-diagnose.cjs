/**
 * Diagnose what the Stripe key can see — so we can confirm the SEEDED account
 * matches the account you connected in Naviio. Read-only.
 *
 *   node scripts/stripe-diagnose.cjs
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/stripe-diagnose.cjs   # check a specific key
 */
const fs = require('fs');
const path = require('path');

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
if (!KEY) { console.error('No STRIPE_SECRET_KEY found.'); process.exit(1); }
const masked = `${KEY.slice(0, 12)}…${KEY.slice(-4)}`;
const stripe = require('stripe')(KEY, { apiVersion: '2026-04-22.dahlia' });

const since90 = Math.floor(Date.now() / 1000) - 90 * 86400;

(async () => {
  console.log(`Key: ${masked} (${KEY.startsWith('rk_') ? 'RESTRICTED key' : 'secret key'})`);
  try {
    const acct = await stripe.accounts.retrieve();
    console.log(`Account: ${acct.id}${acct.settings?.dashboard?.display_name ? ` (${acct.settings.dashboard.display_name})` : ''}`);
  } catch (e) { console.log(`Account: (couldn't read — ${e?.raw?.message || e.message})`); }

  let customers = 0;
  for await (const _ of stripe.customers.list({ limit: 100 })) { void _; customers++; if (customers > 500) break; }

  let active = 0, allSubs = 0;
  for await (const s of stripe.subscriptions.list({ status: 'all', limit: 100 })) { allSubs++; if (s.status === 'active') active++; if (allSubs > 500) break; }

  let charges = 0, grossCents = 0;
  for await (const c of stripe.charges.list({ created: { gte: since90 }, limit: 100 })) {
    if (c.paid && !c.refunded) { charges++; grossCents += c.amount; }
    if (charges > 1000) break;
  }

  console.log(`Customers: ${customers}`);
  console.log(`Subscriptions: ${allSubs} total, ${active} active`);
  console.log(`Paid charges (last 90d): ${charges}  ·  $${(grossCents / 100).toLocaleString()}`);
  console.log('\nIf these numbers look right, this is the account with your data —');
  console.log('connect Naviio with THIS exact key (a full sk_test_… key, not a restricted rk_).');
})().catch((e) => { console.error('Diagnose failed:', e?.raw?.message || e.message); process.exit(1); });
