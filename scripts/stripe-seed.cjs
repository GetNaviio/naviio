/**
 * Seed Stripe TEST data so the dashboard has real numbers to show.
 * Run once on your machine:  node scripts/stripe-seed.cjs
 *
 * Creates a product + a few monthly prices, then a handful of test customers
 * each on a subscription, plus a one-off charge each. Test mode only — it
 * refuses to run against a live key. Safe to re-run (it just adds more).
 */
const fs = require("fs");
const path = require("path");
// Load env from the first matching dotenv file (Next.js uses .env.local), and
// let an inline STRIPE_SECRET_KEY=... win over the file.
const env = {};
for (const name of [".env.local", ".env", ".env.save"]) {
  const p = path.join(__dirname, "..", name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || "";
if (!KEY.startsWith("sk_test_")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY must be a TEST key (sk_test_...).");
  process.exit(1);
}
const stripe = require("stripe")(KEY, { apiVersion: "2026-04-22.dahlia" });

const PLANS = [
  { name: "Naviio Starter", amount: 4900 },
  { name: "Naviio Growth", amount: 14900 },
  { name: "Naviio Pro", amount: 39900 },
];
const NAMES = ["Acme Inc", "Globex", "Initech", "Umbrella Co", "Hooli", "Wayne Co", "Stark LLC", "Wonka Foods"];

(async () => {
  console.log("Seeding Stripe test data…");
  const prices = [];
  for (const p of PLANS) {
    const product = await stripe.products.create({ name: p.name });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: p.amount,
      currency: "usd",
      recurring: { interval: "month" },
    });
    prices.push(price);
    console.log(`  product ${p.name} @ $${p.amount / 100}/mo`);
  }

  let made = 0;
  for (let i = 0; i < NAMES.length; i++) {
    const price = prices[i % prices.length];
    const customer = await stripe.customers.create({
      name: NAMES[i],
      email: `founder${i}@${NAMES[i].toLowerCase().replace(/[^a-z]/g, "")}.test`,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
    });
    await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
    });
    await stripe.charges.create({
      amount: price.unit_amount,
      currency: "usd",
      source: "tok_visa",
      description: `${NAMES[i]} — ${price.id}`,
    }).catch(() => {});
    made++;
    console.log(`  ${NAMES[i]} → subscribed ($${price.unit_amount / 100}/mo)`);
  }

  // Cancel one to create churn signal
  const subs = await stripe.subscriptions.list({ status: "active", limit: 1 });
  if (subs.data[0]) {
    await stripe.subscriptions.cancel(subs.data[0].id);
    console.log("  cancelled 1 subscription (churn signal)");
  }

  console.log(`\nDone. Seeded ${made} customers/subscriptions. Reload your dashboard.`);
})().catch((e) => {
  console.error("Seed failed:", e?.raw?.message || e.message);
  process.exit(1);
});
