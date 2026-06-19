# 0052 — Fractional-CFO advisor access + external document sharing

**Status:** accepted · **Date:** 2026-06-19

## Context

We are taking Naviio to market through fractional CFOs / CPAs first (see
`docs/strategy/fractional-cfo-gtm.md`). That requires a multi-client access model
where a financial professional can work across many clients, and a way to exchange
sensitive documents without Naviio becoming the system of record for them.

Two firm decisions from the founder shaped this:
1. **Clients always own their own login** (client-led model). The advisor never
   holds the client's credentials; the client connects their own bank/Stripe.
2. **Documents live in an external file-sharing platform, not in Naviio.**

## Decision

### Access model
- New `OrgRole.ADVISOR`. An advisor can `view`, `categorize`, `export`, and
  `manage_documents`, but **not** `manage_integrations`, `manage_members`,
  `manage_billing`, or `delete_org` (`src/lib/firm/access.ts`). The control plane
  stays with the client/owner.
- A `Firm` groups a CFO's client orgs for roster, white-label, and (later) billing.
  Access control still lives in `OrgMember` rows — the firm link is organizational,
  never an implicit auth grant.
- **Client-led onboarding:** CFO creates a `ClientInvite`; the client signs up /
  logs in with their own account and **explicitly consents** on accept, which adds
  the advisor as an `ADVISOR` member, links the org to the firm, and records consent.
- **Revoke anytime:** owners see and revoke advisors in Settings → Sharing.
- **Audit:** `AccessLog` records advisor switches into a client workspace, consent,
  document actions, and revocations.

### External documents
- `DocumentSource` holds an OAuth connection to Dropbox (read-only scopes).
  `DocumentRef` stores **pointers only** (name, path, outbound link) — never file
  contents. Opening a file mints a fresh temporary Dropbox link on demand.
- Dropbox is intentionally **separate from the financial `Integration` model**, so
  file sharing is decoupled from financial sync.

## Why these mechanics

- **Raw SQL for all new tables/columns/enum value.** The sandbox cannot run
  `prisma generate`/`migrate` (engine download blocked), so — exactly as with the
  benchmarks snapshot feature — every new-feature read/write goes through
  `$queryRaw`/`$executeRaw`. This keeps `tsc` green against the stale generated
  client and needs no regeneration to ship. `schema.prisma` is still updated as the
  source of truth; on deploy, `prisma generate` + `migrate deploy` reconcile.
- **Document tokens encrypted via `lib/crypto` directly.** The Prisma field-encryption
  extension only wraps the `Integration` model, so `DocumentSource` tokens are
  `encryptSecret`/`decryptSecret`-wrapped explicitly in `lib/documents/store.ts`.
- **Enum value in its own migration** (`20260619000000_org_role_advisor`) before any
  migration references it (Postgres requires `ADD VALUE` to be committed first).

## Privacy / security posture (the GTM selling point)

- Read-only OAuth everywhere; the advisor never sees the client's bank credentials.
- Client owns the login and data; advisor access is consented and revocable.
- Documents never enter Naviio — only links — shrinking our sensitive-data surface.
- All advisor access is logged.

## Consequences / follow-ups

- **Firm-level billing** is not built yet (`CreditAccount` is per-org). Blocked on
  the founder's firm-pays vs. client-pays decision; default is firm-pays.
- **Google Drive** can be added behind the same `DocumentSource.provider` seam.
- On the user's Mac: `prisma generate` + `prisma migrate deploy`
  (`20260619000000_org_role_advisor`, then `20260619000100_firm_and_documents`),
  set `DROPBOX_CLIENT_ID/SECRET/REDIRECT_URI`, and register the Dropbox redirect URI.
