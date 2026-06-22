# 0055 — Firm RBAC tiers (Partner / Analyst / Client)

## Context
CFO firms need different visibility levels for their people. A buyer's checklist:
Partner access, Analyst access, Client access. This is a selling point and a
table-stakes ask for larger accounts.

## Decision
Two layers of roles that compose:

- **Org roles** (existing, `lib/firm/access.ts`): `OWNER` / `MEMBER` / `ADVISOR`
  gate access to a single organization. **Client = the org OWNER** — clients
  always own their own org and data.
- **Firm roles** (new, `lib/firm/roles.ts`): `PARTNER` / `ANALYST` gate firm-wide
  admin.
  - **Partner** — full firm access: billing, branding, Stripe Connect, the client
    book, and managing the team. The `Firm.ownerUserId` is implicitly a Partner.
  - **Analyst** — does client work (`access_clients`) but never firm admin/billing.

## Schema
- `enum FirmRole { PARTNER ANALYST }`
- `model FirmMember { firmId, userId, role, @@unique([firmId, userId]) }`
- Migration `20260622000000_firm_member_rbac`.

## Enforcement
- `firmCan(role, action)` / `firmUserCan(userId, action)` permission checks.
- Firm-admin routes (billing, branding, Connect) were already owner-gated via
  `getFirmForOwner` (only the Partner-owner has a firm); team management
  (`/api/firm/team`) adds an explicit `manage_team` Partner gate.
- `isFirmUser` now also recognizes `FirmMember` rows so Analysts get the firm UI.

## UI
`FirmTeamSection` on the Clients page: roster with tier badges; Partners can add
members by email and set tier (Analyst/Partner) and remove them. Analysts see a
read-only roster.

## Deferred (follow-ups)
- Per-client Analyst assignment (which clients an Analyst can open) — today an
  Analyst is granted client access via the existing per-org `ADVISOR` membership.
- Email invites for teammates without a Naviio account yet (today they must sign
  up first, then be added by email).

## Raw SQL note
`FirmMember` / `FirmRole` are read/written via raw SQL (like the other firm
helpers) so the app does not depend on regenerating the Prisma client. Run
`prisma migrate deploy` to apply the migration in each environment.
