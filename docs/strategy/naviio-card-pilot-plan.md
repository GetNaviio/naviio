# Naviio Card — simple pilot plan

*A small, cheap test to learn whether the card is worth building for real. ~12 weeks, ~25 customers.*

## What we're trying to learn
Three questions, in order of importance:
1. **Will customers actually put real spend on a Naviio card?** (If not, nothing else matters.)
2. **Does the "AI CFO that talks to you on every swipe" feel valuable?** (This is our edge over Ramp — prove people read and act on it.)
3. **Do the money and the operations work?** (Does interchange match our estimate? How much support, fraud, and compliance work does moving money really take?)

We are NOT trying to build the whole product. We're testing the core idea with the smallest thing possible.

## Who we pilot with
- **~25 existing customers** who already trust Naviio, are engaged, and have real card spend.
- Ideally all in **one vertical** (e.g. med-spas) so the experience and benchmarks are tight.
- Treat them as **design partners**: tell them it's an early pilot, ask for honest feedback, give them white-glove attention.

## What we actually ship (keep it tiny)
- **Virtual cards first** (faster and safer than plastic) — one per business, plus a few for employees/subscriptions.
- Every swipe shows up in Naviio in seconds, **auto-categorized**.
- **Navi gives a live note on notable swipes** (overspend warning, "you're paying more than peers," duplicate/odd charge).
- **Simple spend limits** and a **freeze/cancel** button.
- That's it. **No** rewards, bill-pay, treasury, or physical cards yet — those come only if the pilot works.

## The plumbing (rent it, don't build it)
- Pick **one issuer-processor** (Lithic is a common fast start; Stripe Issuing if already deep in Stripe).
- They bring the **sponsor bank** and the **business-verification (KYB)** flow.
- Sign sandbox access first; go live only for the pilot group.

## Timeline (~12 weeks)
- **Weeks 1–2 — Set up.** Choose the partner, sign, get sandbox access. Line up the ~25 design partners (get verbal commitments).
- **Weeks 3–6 — Build the tiny version** in the sandbox: issue virtual cards, catch each swipe, drop it into Naviio with a Navi note, add limits + freeze.
- **Weeks 7–8 — Closed alpha.** Verify (KYB) the businesses; give real cards to the **first ~5**; start small real spend; fix what breaks.
- **Weeks 9–12 — Open to all 25.** Watch usage, collect feedback weekly, measure.

## What success looks like (go / no-go to expand)
- **Activation:** ≥ 60% of the 25 use the card for real spend.
- **Spend:** average monthly card spend per active customer is in the range our model assumed.
- **Engagement:** customers actually read and act on Navi's swipe insights (the differentiator).
- **Love:** they'd keep it and recommend it (simple thumbs-up / NPS).
- **Money:** realized interchange roughly matches the estimate.
- **Operations:** support tickets, fraud, and compliance time are manageable.

If most of these hit → expand (more customers, then physical cards + bill-pay). If activation or engagement is weak → iterate on the experience before spending more. If the spend or ops math is bad → stop and rethink.

## Guardrails while testing
- Start with **low limits** and virtual-only.
- **One vertical**, small group, clear "pilot" framing, ability to pause anytime.
- A human reviews early activity; don't fully automate risk on day one.

## Rough cost
- Main cost is **engineering time** to build the tiny version and wire swipes into Naviio.
- Partner fees are usually small at pilot scale (sandbox + per-card).
- Budget some **legal/compliance review** time — necessary because money is moving.

## Bottom line
A focused, ~3-month, ~25-customer test that answers the only questions that matter — *will they use it, do they value the AI-CFO twist, and does the money work* — before committing to building a card business.
