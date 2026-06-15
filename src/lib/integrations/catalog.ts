/**
 * The integration catalog — every connector Naviio offers or plans to offer,
 * organized so any industry finds its tools.
 *
 * Two tiers:
 *  - LIVE: OAuth shipped, syncs today (rendered by the existing connect cards)
 *  - COMING SOON: catalogued with a "Request" action that records demand per
 *    org (IntegrationRequest table) — the roadmap is driven by real votes,
 *    not guesses.
 *
 * Note for catalog copy: Plaid is not "one integration" — it is 12,000+ banks
 * and credit unions, and Stripe covers card payments for nearly every
 * industry. The financial CORE already fits every business; the catalog adds
 * the industry-specific operational layers.
 */

export type CatalogCategory =
  | 'Banking'
  | 'Payments'
  | 'Accounting'
  | 'Payroll & HR'
  | 'eCommerce & POS'
  | 'CRM & Sales'
  | 'Billing & Subscriptions'
  | 'Expenses & Spend'
  | 'Industry tools'

export interface CatalogEntry {
  slug: string
  name: string
  description: string
  logo: string // emoji used as a lightweight mark, consistent with live cards
  category: CatalogCategory
  /** Industries this matters most for — drives the filter chips. */
  industries: string[]
}

/** Connectors users can vote for. Order within a category = our priority guess. */
export const COMING_SOON: CatalogEntry[] = [
  // ── Payments ──
  { slug: 'square', name: 'Square', description: 'Card payments, POS sales, and deposits for retail, food service, and services businesses.', logo: '⬛', category: 'Payments', industries: ['Retail', 'Restaurants', 'Services'] },
  { slug: 'paypal', name: 'PayPal', description: 'PayPal and Venmo business payments, payouts, and fees.', logo: '🅿️', category: 'Payments', industries: ['eCommerce', 'Services'] },

  // ── Accounting ──
  { slug: 'freshbooks', name: 'FreshBooks', description: 'Invoices, expenses, and time tracking for service businesses and freelancers.', logo: '🧾', category: 'Accounting', industries: ['Services', 'Agencies', 'Freelance'] },
  { slug: 'wave', name: 'Wave', description: 'Free accounting data for very small businesses.', logo: '🌊', category: 'Accounting', industries: ['Micro business'] },
  { slug: 'sage', name: 'Sage', description: 'Accounting and payroll for established SMBs (Sage 50/Intacct).', logo: '🌿', category: 'Accounting', industries: ['Manufacturing', 'Distribution', 'Nonprofit'] },

  // ── Payroll & HR ──
  { slug: 'deel', name: 'Deel', description: 'Global payroll and contractor payments — actual people costs synced into your workforce plan.', logo: '🌍', category: 'Payroll & HR', industries: ['Remote teams', 'SaaS', 'Agencies'] },
  { slug: 'rippling', name: 'Rippling', description: 'Payroll, benefits, and headcount from Rippling.', logo: '〰️', category: 'Payroll & HR', industries: ['SaaS', 'Tech'] },
  { slug: 'paychex', name: 'Paychex', description: 'Payroll runs and labor costs for traditional SMBs.', logo: '🪙', category: 'Payroll & HR', industries: ['Services', 'Construction', 'Healthcare'] },

  // ── eCommerce & POS ──
  { slug: 'amazon', name: 'Amazon Seller', description: 'Marketplace sales, fees, and settlements for Amazon sellers.', logo: '📦', category: 'eCommerce & POS', industries: ['eCommerce'] },
  { slug: 'woocommerce', name: 'WooCommerce', description: 'Orders and revenue from WordPress stores.', logo: '🟣', category: 'eCommerce & POS', industries: ['eCommerce'] },
  { slug: 'etsy', name: 'Etsy', description: 'Shop sales, fees, and deposits for makers and creators.', logo: '🧶', category: 'eCommerce & POS', industries: ['eCommerce', 'Creators'] },
  { slug: 'toast', name: 'Toast', description: 'Restaurant POS sales, tips, and labor data.', logo: '🍞', category: 'eCommerce & POS', industries: ['Restaurants'] },
  { slug: 'clover', name: 'Clover', description: 'POS sales and payments for retail and food service.', logo: '🍀', category: 'eCommerce & POS', industries: ['Retail', 'Restaurants'] },

  // ── CRM & Sales ──
  { slug: 'hubspot', name: 'HubSpot', description: 'Pipeline, deals, and forecast inputs from HubSpot CRM.', logo: '🟠', category: 'CRM & Sales', industries: ['SaaS', 'Agencies', 'Services'] },
  { slug: 'salesforce', name: 'Salesforce', description: 'Opportunity pipeline and bookings from Salesforce.', logo: '☁️', category: 'CRM & Sales', industries: ['SaaS', 'Enterprise sales'] },
  { slug: 'pipedrive', name: 'Pipedrive', description: 'Deal flow and pipeline value for sales-led SMBs.', logo: '🚰', category: 'CRM & Sales', industries: ['Services', 'Agencies'] },

  // ── Billing & Subscriptions ──
  { slug: 'chargebee', name: 'Chargebee', description: 'Subscription billing, MRR movements, and dunning.', logo: '🐝', category: 'Billing & Subscriptions', industries: ['SaaS'] },
  { slug: 'recurly', name: 'Recurly', description: 'Recurring billing and churn analytics.', logo: '🔁', category: 'Billing & Subscriptions', industries: ['SaaS', 'Media'] },
  { slug: 'paddle', name: 'Paddle', description: 'Merchant-of-record revenue for software companies selling globally.', logo: '🏓', category: 'Billing & Subscriptions', industries: ['SaaS'] },

  // ── Expenses & Spend ──
  { slug: 'ramp', name: 'Ramp', description: 'Corporate cards, bills, and spend categorized at the source.', logo: '📈', category: 'Expenses & Spend', industries: ['SaaS', 'All industries'] },
  { slug: 'brex', name: 'Brex', description: 'Card spend and cash management for startups.', logo: '⚡', category: 'Expenses & Spend', industries: ['SaaS', 'Startups'] },
  { slug: 'expensify', name: 'Expensify', description: 'Employee expense reports and reimbursements.', logo: '🧳', category: 'Expenses & Spend', industries: ['Services', 'All industries'] },
  { slug: 'billcom', name: 'Bill.com', description: 'AP/AR automation — bills in, invoices out, payment timing for cash forecasts.', logo: '💸', category: 'Expenses & Spend', industries: ['Services', 'Distribution'] },

  // ── Industry tools ──
  { slug: 'housecallpro', name: 'Housecall Pro', description: 'Jobs, invoices, and revenue for home-services businesses.', logo: '🏠', category: 'Industry tools', industries: ['Home services', 'Trades'] },
  { slug: 'jobber', name: 'Jobber', description: 'Field-service quotes, jobs, and payments.', logo: '🛠️', category: 'Industry tools', industries: ['Home services', 'Trades'] },
  { slug: 'mindbody', name: 'Mindbody', description: 'Memberships, classes, and revenue for fitness and wellness studios.', logo: '🧘', category: 'Industry tools', industries: ['Fitness', 'Wellness'] },
  { slug: 'opentable', name: 'OpenTable', description: 'Covers and booking trends correlated with restaurant revenue.', logo: '🍽️', category: 'Industry tools', industries: ['Restaurants'] },
  { slug: 'procore', name: 'Procore', description: 'Project budgets and committed costs for construction.', logo: '🏗️', category: 'Industry tools', industries: ['Construction'] },
  { slug: 'clio', name: 'Clio', description: 'Matters, billing, and trust accounting for law firms.', logo: '⚖️', category: 'Industry tools', industries: ['Legal'] },
]

export const ALL_INDUSTRIES: string[] = [
  ...new Set(COMING_SOON.flatMap((e) => e.industries)),
].sort()

const SLUGS = new Set(COMING_SOON.map((e) => e.slug))
export function isKnownComingSoon(slug: string): boolean {
  return SLUGS.has(slug)
}
