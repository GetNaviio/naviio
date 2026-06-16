# 0045 — Mobile dashboard: fewer cards, accountant-prioritized

- **Date:** 2026-06-16
- **Status:** accepted
- **Owner (DRI):** product (with accountant-agent review)

## Decision
The mobile dashboard showed ~8 equal metric cards — too much for a glance. Per
the accountant agent's prioritization, mobile now leads with one hero number and
three source-aware chips, and the header is reduced to the brand icon + bell.

## Changes
- **Header** (`Header.tsx`) — on mobile the sticky bar is just the brand icon +
  alert bell; the page title (and subtitle) drop **below** the bar as a scrolling
  block. Desktop keeps the title inline. (Title isn't lost — it moves, not goes.)
- **Dashboard mobile feed** — replaced the hero-cash + 7-chip grid with:
  - **Hero = Runway** ("X mo") with cash + burn as the subtitle and a cash
    month-over-month trend arrow (the one survival number a founder checks).
  - **3 chips**: Burn · (MRR if Stripe-connected, else Net Income YTD) · Net Margin.
  - **Source-aware**: a bank-only business shows Net Income (never an empty MRR or
    "0 customers"); a Stripe-only business leads with MRR and prompts to connect a
    bank for runway. Branch is driven by connected integrations, not a setting.
  - **Cut on mobile**: ARR, Total Income YTD, Churn %, Customers count (they live
    in the desktop grid and drill-downs). Desktop 4-col grid is unchanged.

## Why
A founder's morning question is "am I OK?" — runway answers it by folding cash and
burn into one number. One hero + three directional chips is the cleanest glanceable
hierarchy; the rest is one scroll/tap away.

## Verification
- `tsc` + `eslint` clean. Desktop dashboard unchanged (`hidden lg:grid`).
