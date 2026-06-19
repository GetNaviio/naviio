# Fractional CFO GTM — Naviio

**Thesis:** sell Naviio *through* fractional CFOs, CPAs, and financial professionals before selling it direct to founders. Advisors bring a roster of clients each, they give the sharpest product feedback, and they become a distribution channel: every client they onboard is a logged-in Naviio account that can later convert direct. We trade a slower start for a denser, higher-signal early base and a product hardened by the most demanding users.

This doc is the operating plan: who we target, what we say, how onboarding works in-product, how we price it, and the 90-day motion.

---

## 1. Why advisors first

- **Leverage.** One fractional CFO manages 5–20 clients. Land the advisor and you're in front of their whole book — a 1-to-many wedge a direct motion can't match early on.
- **Feedback density.** Advisors compare tools for a living. They'll tell us where the numbers are wrong, where the close breaks, what a board actually wants. That feedback is the fastest path to a defensible product.
- **Trust transfer.** Founders trust their CFO's tooling choice. An advisor recommending Naviio carries more weight than any ad.
- **Natural fit with the model.** Naviio already computes, doesn't hallucinate, and ties every figure to a transaction. That's exactly the standard a financial professional demands — so they're the right judges, and the product is built to survive their scrutiny.

---

## 2. Ideal customer profile (the advisor)

**Primary:** independent fractional CFOs and boutique CFO/advisory firms (1–10 staff) serving 5–25 venture-backed or bootstrapped SMBs ($250k–$10M revenue), where the clients run on Stripe + a connectable bank (the data Naviio needs).

**Secondary:** CPAs and bookkeeping firms moving up-market into advisory ("CAS" — client accounting & advisory services) who want a real-time dashboard to sit on top of the books.

**Disqualifiers:** pure tax-prep shops with no advisory motion; clients who are cash-only or off-Stripe (benchmarks and revenue intelligence come up empty); enterprises needing full ERP.

**Where they are:** fractional-CFO communities and Slacks, CPA/CAS LinkedIn, r/fractionalcfo and accounting Twitter, Collective/Pilot/Puzzle ecosystems, local CPA society events, podcasts aimed at modern accounting firms.

---

## 3. Positioning

**One line:** *Naviio is the real-time finance workspace fractional CFOs run their whole client book from — every number defensible, every client a login of their own.*

**The three proof points an advisor cares about:**

1. **Defensible numbers.** Deterministic engine, cash-basis labeled, every figure traceable to a transaction. No black-box AI guesses in front of a client's board.
2. **One roster, many clients.** Add a client, they connect their own bank/Stripe, you switch between workspaces from one login. White-label the portal and board packs with your firm's brand.
3. **You hold no keys.** Clients own their login and data; you have advisor access they granted and can revoke. You never touch their bank credentials — Plaid/Stripe OAuth keeps the client in control. This is the compliance answer that lets risk-averse CPAs say yes.

**Against the alternatives:** spreadsheets (manual, stale, error-prone), Fathom/Jirav (report-heavy, slow to set up, no live transaction trail), Puzzle/Digits (accounting-first, less CFO-decision-oriented). Naviio's wedge: live, defensible decision support with a CFO's framing (runway, burn, scenarios, board packs) plus peer benchmarks no one else has.

---

## 4. What we shipped to enable this (product state)

The access + collaboration model is now in-product:

- **Advisor role.** A fractional CFO is added to a client's org as an `ADVISOR`: can view, categorize/reclassify, and export board packs — but cannot disconnect integrations, change billing, manage members, or delete the org. Control plane stays with the client.
- **Client-led onboarding.** The CFO clicks *Add client*, sends a one-time link. The client signs up with **their own login**, connects their own bank/Stripe, and explicitly **consents** to advisor access. Clients always own their account and data.
- **Client roster + switcher.** The CFO sees every client, who's connected their accounts, and opens any client's workspace in one click. Firm grouping supports white-label branding.
- **Revoke anytime.** Clients see who has advisor access in Settings and can revoke instantly. Every advisor entry into a client workspace is access-logged for transparency.
- **External document sharing (Dropbox).** Client and CFO share statements, tax docs, and working files via Dropbox. **Files live in Dropbox — Naviio stores only a link, never a copy** — which keeps sensitive documents out of our system and simplifies the data-handling story.

This is the GTM-critical foundation: an advisor can run a real client engagement end-to-end today.

---

## 5. Packaging & pricing (decided)

Two firm plans (see `lib/firm/billing.ts` for the canonical numbers; decision in
`docs/decisions/0053-firm-billing-plans.md`):

**Option 1 — White-label ($799/mo).** The firm pays Naviio and absorbs the cost as
part of its service; **clients are not charged**. Includes up to **10 client orgs**,
then **$59/org/mo**. Billed as a direct Stripe subscription (base + graduated
per-org overage). For firms that bundle software into their fee.

**Option 2 — White-label + SaaS resale ($997/mo).** The firm **resells** Naviio to
its clients and sets its own retail price. Includes up to **25 client orgs**
(then $59/org). Clients pay through Naviio via **Stripe Connect**, and Naviio keeps
a **15% commission** as an application fee — collected automatically, no reporting,
no leakage. For established firms turning Naviio into a profit center. (Rule of
thumb: a firm needs ~8 paying resale clients to clear the $997 base, so steer
newer firms to Option 1.)

- **Pilot (now):** free for the advisor and their first 3–5 clients during the
  design-partner period, in exchange for feedback and a testimonial. No card.
- **Client self-upgrade path (later):** a client who wants Naviio beyond the
  engagement converts to a direct plan — the channel becomes a funnel.

**Worked example (15 clients, ~$150/org client price):** Option 1 → Naviio $1,094/mo.
Option 2 @15% → Naviio $1,334/mo and the firm nets ~$916/mo of resale margin *on top
of* its service fees. Option 2 earns Naviio more and hands the firm a profit center —
which is why it's the upsell.

Both plans are implemented (plan picker + estimated bill on the Clients page,
Connect onboarding for Option 2). Live charging activates once Stripe billing keys
+ Connect are enabled on the platform account.

---

## 6. The 90-day motion

**Phase 0 — Design partners (weeks 1–4): land 10 advisors.**
- Source from fractional-CFO Slacks/communities, warm intros, and targeted LinkedIn outreach to independent CFOs (not big firms).
- Offer: free pilot, white-glove onboarding of their first 3 clients, direct line to the team, and influence on the roadmap.
- Goal: 10 advisors live, each with ≥2 clients connected. Weekly feedback calls.

**Phase 1 — Prove the loop (weeks 5–8): make them successful.**
- Ship fixes from feedback fast (this is the whole point of advisors-first).
- Get one advisor to run a real monthly client review *inside Naviio* and export a branded board pack. That's the reference workflow.
- Capture 2–3 written testimonials + one case study ("how [Firm] runs 8 clients on Naviio").

**Phase 2 — Productize the channel (weeks 9–12): make it repeatable.**
- Turn the white-glove onboarding into a self-serve flow + a 1-page advisor onboarding guide.
- Launch the Firm plan pricing; convert design partners to paid (with founder pricing).
- Open a lightweight "Naviio for Advisors" page + referral: advisors who bring clients get a revenue share or credit.
- Target: 25 advisors, 100+ connected client workspaces.

**Success metrics:** advisors activated (≥2 clients connected), clients connected per advisor, weekly active advisor sessions, monthly board packs exported, advisor NPS, and pilot→paid conversion.

---

## 7. Outreach (advisor-targeted)

**Cold email — subject options:**
- Run your whole client book from one finance workspace?
- A real-time CFO dashboard your clients log into themselves
- 10 fractional CFOs, free pilot — want in?

**Body:**

Hi {First name},

You're juggling {N} clients' finances across spreadsheets and logins. We built Naviio so a fractional CFO can run the whole book from one place: each client connects their own bank and Stripe, you switch between live dashboards, and every number ties back to a transaction you can defend in front of their board.

What makes it work for an advisor specifically:
- Clients own their own login and data — you get advisor access they grant and can revoke. You never hold their bank credentials.
- White-label the portal and board packs with your firm's brand.
- Peer benchmarks: show a client how their spend and burn compare to companies their size (anonymized) — a conversation only you can have.

We're running a small design-partner pilot — free for you and your first few clients — in exchange for your feedback. You'd have a direct line to the team and real influence on what we build.

Worth 20 minutes? Reply "in" and I'll set you up.

{Your name} · Naviio

**LinkedIn / community blurb:**

> Fractional CFOs: we built the workspace you run your whole client book from. Clients connect their own bank + Stripe (you never hold their keys), you switch between live dashboards, board packs export with *your* brand. Free design-partner pilot open now — comment or DM "in."

---

## 8. Advisor onboarding playbook (in-product, today)

1. Advisor signs up → goes to **Clients** → **Add a client** (enters client name + email).
2. Advisor sends the generated one-time link to the client.
3. Client opens it → creates their own Naviio login → connects bank/Stripe → **approves advisor access** (explicit consent screen).
4. Client lands in their own workspace; advisor now sees them in the roster and can **Open** their workspace.
5. Advisor and client share supporting docs via **Documents** (Dropbox; files stay in Dropbox).
6. Advisor runs the monthly review, exports a branded board pack, and benchmarks the client against peers.
7. Client can review/revoke advisor access anytime in **Settings → Sharing → Advisor access**.

---

## 9. Risks & honest answers

- **"Will a CPA trust putting client data here?"** The answer is the architecture: read-only OAuth, client owns the login, advisor access is consented and revocable, documents stay in Dropbox, access is logged. Lead with this — it's the objection that kills deals if unanswered, and a strength once shown.
- **Clients off Stripe / cash-heavy.** Benchmarks and revenue intelligence underperform. Qualify for it; don't oversell to mismatched clients.
- **Channel conflict later.** If we go direct-to-founder hard while advisors are mid-engagement, we erode trust. Keep the advisor as the account owner of the relationship; the direct funnel is for clients *without* an advisor.
- **Pricing unproven.** Hence the free pilot — we set Firm-plan pricing from observed value (clients per advisor, board packs run), not a guess.

---

## 10. Immediate next steps

1. **Eric to decide:** Firm-pays-for-seats (recommended) vs. client-pays; this unblocks the firm-level billing build.
2. Draft the target list of 25 fractional CFOs (warm intros first) and start Phase 0 outreach with the email above.
3. White-glove the first 3 advisors personally; treat every piece of feedback as a P0 input.
4. Stand up a "Naviio for Advisors" landing section once 3 testimonials exist.
