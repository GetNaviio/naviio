# Naviio — Social Content Log

> Running memory for the `social-media` agent. Append a new entry under "Posts"
> for every caption written. Read this top-to-bottom before drafting anything so
> voice stays consistent and hooks don't repeat.

## Brand brief
- **Name / tagline:** Naviio — "Your Financial Co-Pilot."
- **Status:** Private beta. **Launching Q4 2026.** CTA is always "join the waitlist."
- **One-liner:** Connects your bank, accounting, and revenue tools and turns them
  into CFO-level clarity in real time — no spreadsheets, no waiting on accountants.
- **Signature feature:** Financial-health score across six metrics — revenue
  growth, profit margin, cash flow, debt ratio, expense control, DSO — shown as a
  hexagon radar.
- **Audience:** SMB owners, founders, finance leads, fractional CFOs / advisors.
- **Voice:** confident, clear, aspirational; short punchy lines; light aviation
  metaphor (co-pilot, altitude, flight path, "you can't steer what you can't see").
- **Look:** deep navy/sky imagery, blue (#3B82F6) + teal (#06d6a0) accents.

## Themes in rotation
- Visibility / blind spots ("revenue problem vs. visibility problem")
- Real-time clarity vs. month-old spreadsheets
- The six-metric health score / one number for your business
- Connecting fragmented tools (bank + accounting + Stripe)
- Founder / CFO peace of mind

## Hooks already used (don't repeat verbatim)
- "Most businesses don't have a revenue problem. They have a visibility problem."

---

## Posts

### #001 — 2026-06-07 — Carousel "Visibility Problem" (slide 01/08)
- **Platform:** LinkedIn / Instagram (versatile)
- **Series:** 8-slide carousel; this is slide 1 (the hook). Slides 2–8 TBD.
- **On-image text:** "Most businesses don't have a revenue problem. They have a
  visibility problem." — Naviio, Coming Q4 2026.
- **Theme:** Visibility / blind spots.
- **Status:** Draft (awaiting post)
- **Caption (≤160 chars — simplifier format):**

> You don't have a revenue problem. You have a visibility problem. Naviio gives you CFO-level clarity in real time. Join the waitlist ✈️

- **Char count:** 134
- **Hashtags used:** none (kept short)

### #002 — 2026-06-07 — TikTok "Flying Blind" (video, from #001)
- **Platform:** TikTok (repurpose to Reels + Shorts)
- **Format:** ~25s text-on-broll video. Full script + storyboard: `social-media/tiktok-visibility-problem.md`. Animated preview built in chat.
- **Theme:** Visibility / blind spots (video extension of the carousel hook).
- **Status:** Draft (script + preview ready; needs filming/edit)
- **Caption (≤160):**

> Be honest: could you prove your business is profitable right now? Naviio turns 3 dashboards into 1 real-time score. Join the waitlist ✈️

- **Char count:** 136
- **Hook used:** "Your business isn't broke — you're just flying blind." (video hook; distinct from #001's caption)
- **Pinned comment:** "Be honest — could you answer that right now? 👇" (comment bait)

### #003–#007 — 2026-06-07 — TikTok series "Flying Blind" (5 concepts)
- **Platform:** TikTok (repurpose to Reels + Shorts). Full scripts: `social-media/tiktok-series-visibility.md`.
- **Theme:** Visibility / blind spots, leaning into the aviation identity (ownable).
- **Status:** Draft (scripts ready; need filming/edit). Flagship #003 has an animated preview built in chat.
- **Rollout order:** #003 → #005 → #004 → #006 → #007.

  - **#003 "Black Box"** (cold-open horror, flagship). Caption (136): _Every business that fails has a black box. Most founders never read it until it's too late. Naviio is yours — live. Join the waitlist ✈️_
  - **#004 "Same revenue. Two endings."** (split-screen POV). Caption (134): _Same revenue. Two founders. Only one saw the cash dip coming. Naviio is the co-pilot that flags it 3 weeks early. Join the waitlist ✈️_
  - **#005 "Your bank balance is lying to you."** (green-screen hot take). Caption (125): _Your bank balance is lying to you. Cash isn't profit. Profit isn't runway. Naviio shows all three, live. Join the waitlist ✈️_
  - **#006 "Accountant vs. Naviio"** (oddly-satisfying speedrun). Caption (110): _Finding out if you're profitable: 3 weeks with your accountant, or 8 seconds with Naviio. Join the waitlist ✈️_
  - **#007 "Sounds a business makes before it dies"** (listicle trend). Caption (122): _5 sounds a business makes right before it dies — and how to hear them early. Naviio flags all 5 live. Join the waitlist ✈️_

### #008 — 2026-06-07 — TikTok "Same flight. Two skies." (turbulence vs clear)
- **Platform:** TikTok / Reels / Shorts. Full concept + AI-video prompts: `social-media/tiktok-clear-vs-turbulence.md`. Animated scene built in chat.
- **Theme:** Visual metaphor — turbulence (no Naviio) → clear skies (Naviio). The flagship "real graphics, not just words" piece.
- **Status:** Draft (animated scene + AI-video prompts ready).
- **Caption (140):** _Running a business without real-time numbers is turbulence. Naviio is clear skies. Same flight, totally different ride. Join the waitlist ✈️_
- **Pinned comment:** "Which sky is your business in right now? ✈️"
- **Hook used:** "Same flight. Two skies." / turbulence→clear breakthrough.
- **Rendered video:** `social-media/graphics/naviio-turbulence-9x16.mp4` (1080×1920, ~11.7s, silent — add Commercial-Library track in TikTok). Built from the user's two photos via `make_video_assets.py` + ffmpeg (storm shake → crossfade → clear push-in). Keyframes: `storm_v.png`, `clear_v.png`.

## Motion graphic (`social-media/graphics/`)
Clean, on-brand vector/type animation rendered frame-by-frame (`make_motion.py` → ffmpeg). Headline → hexagon score assembling + count-up to 82 → "Six signals. One score." → logo + Join the waitlist.
- `naviio-brand-4k.mp4` — 2160×3840, 8s, navy background (standalone post).
- `naviio-brand-alpha-1080.webm` — 1080×1920 VP9 with alpha (transparent overlay; ProRes .mov on request for CapCut/Premiere).
- Silent — add a Commercial-Library track. Fonts are DejaVu (swap to DM Sans / Instrument Serif in editor to match the kit exactly).

## Graphics kit (`social-media/graphics/`)
Reusable 1080×1920 SVG assets — export to PNG or drop into CapCut.
- `hexagon-score.svg` — signature health-score radar (reveal frame, all videos)
- `cta-end-card.svg` — reusable end card (logo + "Join the waitlist" + Q4 2026)
- `black-box-hud.svg` — cockpit warning title card for #003 "Black Box"

## Hooks already used (append)
- "Every business that fails has a black box."
- "Same revenue. Two founders."
- "Your bank balance is lying to you."
- "Am I profitable? 3 weeks vs 8 seconds."
- "5 sounds a business makes before it dies."
