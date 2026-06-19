"use client"

import { useEffect, useState } from 'react'
import WaitlistForm from '@/components/WaitlistForm'
import LegalModal from '@/components/legal/LegalModal'
import type { DocKey } from '@/components/legal/legalData'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --ink: #0a0e1a; --ink2: #1c2340; --sky: #e8f0fe;
  --accent: #3B82F6; --accent2: #06d6a0; --muted: #8892a4;
  --card: rgba(255,255,255,0.06); --border: rgba(255,255,255,0.10); --white: #ffffff;
}
/* light theme for the global app is defined in globals.css */
html { scroll-behavior: smooth; }
.naviio-page { font-family: 'DM Sans', sans-serif; background: var(--ink); color: var(--white); overflow-x: hidden; cursor: none; }

/* Cursor */
.cursor { position: fixed; top: 0; left: 0; z-index: 9999; pointer-events: none; }
.cursor-dot { width: 8px; height: 8px; background: var(--accent2); border-radius: 50%; transform: translate(-50%,-50%); position: absolute; transition: transform 0.1s; }
.cursor-ring { width: 36px; height: 36px; border: 1px solid rgba(37,99,255,0.5); border-radius: 50%; transform: translate(-50%,-50%); position: absolute; transition: all 0.18s ease; }

/* Nav */
nav.nv { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 0.9rem clamp(1.25rem, 4vw, 3rem); background: rgba(10,14,26,0.7); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); }
.nv-links { display: flex; gap: 2rem; align-items: center; }
.nv-links a { color: var(--muted); text-decoration: none; font-size: 0.9rem; font-weight: 400; transition: color 0.2s; }
.nv-links a:hover { color: var(--white); }
.nv-links a.nv-cta { background: var(--accent); color: var(--white); padding: 0.55rem 1.4rem; border-radius: 100px; font-size: 0.875rem; font-weight: 500; text-decoration: none; transition: all 0.2s; }
.nv-links a.nv-cta:hover { background: #1d4ed8; color: var(--white); transform: translateY(-1px); }
@media(max-width:900px){ .nv-links{gap:1.25rem;} .nv-links a{font-size:0.85rem;} }
@media(max-width:640px){ nav.nv{padding:0.75rem 1.25rem;} .nv-links a:not(.nv-cta){display:none;} }

/* Hero */
.hero { min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 7.5rem clamp(1.25rem, 4vw, 2rem) 4rem; position: relative; overflow: hidden; }
/* Anchor targets clear the fixed nav instead of scrolling underneath it */
.features, .integrations, .pricing, .cta-section { scroll-margin-top: 88px; }
.grid-bg { position: absolute; inset: 0; z-index: 0; background-image: linear-gradient(rgba(37,99,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,255,0.06) 1px, transparent 1px); background-size: 60px 60px; mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 100%); animation: gridShift 20s linear infinite; }
@keyframes gridShift { 0%{background-position:0 0;} 100%{background-position:60px 60px;} }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; z-index: 0; }
.orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(37,99,255,0.18) 0%, transparent 70%); top: -100px; left: -100px; animation: orbFloat 12s ease-in-out infinite; }
.orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(6,214,160,0.14) 0%, transparent 70%); bottom: 0; right: -50px; animation: orbFloat 16s ease-in-out infinite reverse; }
@keyframes orbFloat { 0%,100%{transform:translate(0,0);} 50%{transform:translate(30px,20px);} }
.hero-badge { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; text-align: center; max-width: 100%; background: rgba(37,99,255,0.12); border: 1px solid rgba(37,99,255,0.3); color: #93b4ff; border-radius: 100px; padding: 0.4rem 1rem; font-size: 0.8rem; font-weight: 500; margin-bottom: 2rem; position: relative; z-index: 1; animation: fadeUp 0.6s ease both; }
.badge-pulse { width: 6px; height: 6px; background: var(--accent2); border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(0.8);} }
.hero h1 { font-family: 'Instrument Serif', serif; font-size: clamp(2.75rem,7vw,6.5rem); line-height: 1.05; letter-spacing: -0.03em; max-width: 820px; position: relative; z-index: 1; animation: fadeUp 0.6s 0.1s ease both; }
.hero h1 em { font-style: italic; background: linear-gradient(135deg,#6096ff,var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; padding-right: 0.12em; margin-right: -0.04em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.hero-sub { margin-top: 1.5rem; font-size: 1.1rem; color: var(--muted); line-height: 1.7; max-width: 520px; position: relative; z-index: 1; animation: fadeUp 0.6s 0.2s ease both; }
.hero-ctas { margin-top: 2.5rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; justify-content: center; position: relative; z-index: 1; animation: fadeUp 0.6s 0.3s ease both; }
.btn-primary { background: var(--accent); color: var(--white); padding: 0.85rem 2rem; border-radius: 100px; font-size: 0.95rem; font-weight: 500; text-decoration: none; transition: all 0.2s; box-shadow: 0 0 30px rgba(37,99,255,0.35); }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 0 50px rgba(37,99,255,0.5); }
.btn-ghost { color: var(--muted); font-size: 0.95rem; text-decoration: none; display: flex; align-items: center; gap: 6px; transition: color 0.2s; }
.btn-ghost:hover { color: var(--white); }

/* Hero visual (3D scene container) */
.hero-visual { position: relative; z-index: 1; margin-top: 4rem; width: 100%; max-width: 900px; animation: fadeUp 0.6s 0.4s ease both; }
.up { color: var(--accent2); } .dn { color: #f87171; }
.ai-icon { width: 28px; height: 28px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; flex-shrink: 0; }
.ai-text { font-size: 0.78rem; color: var(--white); line-height: 1.4; }
.ai-text span { color: var(--muted); font-size: 0.72rem; display: block; }

@keyframes fadeUp { from{opacity:0;transform:translateY(24px);} to{opacity:1;transform:translateY(0);} }

/* Logos */
.logos-strip { padding: 5rem clamp(1.25rem, 4vw, 3rem) 3rem; text-align: center; }
.logos-label { font-size: 0.8rem; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 2rem; }
.logos-row { display: flex; align-items: center; justify-content: center; gap: 3rem; flex-wrap: wrap; }
.logo-item { color: rgba(255,255,255,0.25); font-size: 1rem; font-weight: 600; letter-spacing: 0.04em; transition: color 0.2s; }
.logo-item:hover { color: rgba(255,255,255,0.6); }

/* Features */
.features { padding: 6rem clamp(1.25rem, 4vw, 3rem); max-width: 1100px; margin: 0 auto; }
.section-tag { display: inline-block; font-size: 0.75rem; color: #93b4ff; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 1rem; }
.section-title { font-family: 'Instrument Serif', serif; font-size: clamp(2rem,4vw,3.2rem); line-height: 1.15; letter-spacing: -0.02em; max-width: 560px; margin-bottom: 3.5rem; }
.section-title em { font-style: italic; color: var(--accent2); }
.features-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.5px; background: var(--border); border-radius: 16px; overflow: hidden; }
@media(max-width:980px){ .features-grid{grid-template-columns:repeat(2,1fr);} }
@media(max-width:600px){ .features-grid{grid-template-columns:1fr;} }
.feature-card { background: var(--ink); padding: 2rem; transition: background 0.3s; }
.feature-card:hover { background: rgba(37,99,255,0.06); }
.feature-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(37,99,255,0.15); border: 1px solid rgba(37,99,255,0.25); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; font-size: 1.1rem; }
.feature-name { font-weight: 600; font-size: 1rem; margin-bottom: 0.5rem; }
.feature-desc { font-size: 0.875rem; color: var(--muted); line-height: 1.65; }

/* Integrations */
.integrations { padding: 6rem clamp(1.25rem, 4vw, 3rem); background: rgba(255,255,255,0.02); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); text-align: center; }
.integrations .section-title { margin: 0 auto 1rem; }
.section-sub { color: var(--muted); font-size: 0.95rem; margin-bottom: 3rem; }
.int-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 700px; margin: 0 auto; }
.int-pill { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 100px; padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 500; color: var(--muted); transition: all 0.2s; }
.int-pill:hover { background: rgba(37,99,255,0.1); border-color: rgba(37,99,255,0.3); color: var(--white); }
.int-pill.launch { color: var(--accent2); border-color: rgba(6,214,160,0.3); background: rgba(6,214,160,0.06); }

/* Pricing */
.pricing { padding: 6rem clamp(1.25rem, 4vw, 3rem); max-width: 1100px; margin: 0 auto; }
.pricing-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; }
@media(max-width:900px){ .pricing-grid{grid-template-columns:1fr 1fr;} }
@media(max-width:560px){ .pricing-grid{grid-template-columns:1fr;} }
.pricing-card { background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 16px; padding: 1.75rem; transition: all 0.3s; position: relative; }
.pricing-card:hover { transform: translateY(-4px); border-color: rgba(37,99,255,0.3); }
.pricing-card.featured { background: linear-gradient(145deg,rgba(37,99,255,0.15),rgba(37,99,255,0.05)); border-color: rgba(37,99,255,0.4); }
.pricing-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--accent); color: white; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.25rem 0.9rem; border-radius: 100px; white-space: nowrap; }
.pricing-tier { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; }
.pricing-price { font-family: 'Instrument Serif', serif; font-size: 2.5rem; letter-spacing: -0.03em; margin-bottom: 0.25rem; }
.pricing-price span { font-size: 1rem; font-family: 'DM Sans', sans-serif; color: var(--muted); }
.pricing-desc { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.5rem; line-height: 1.5; }
.pricing-features { list-style: none; margin-bottom: 1.75rem; }
.pricing-features li { font-size: 0.83rem; color: var(--muted); padding: 0.35rem 0; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.pricing-features li:last-child { border-bottom: none; }
.check { color: var(--accent2); font-size: 0.9rem; }
.pricing-btn { display: block; text-align: center; padding: 0.7rem; border-radius: 100px; font-size: 0.875rem; font-weight: 500; text-decoration: none; transition: all 0.2s; border: 1px solid var(--border); color: var(--white); background: transparent; }
.pricing-card.featured .pricing-btn { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 20px rgba(37,99,255,0.3); }
.pricing-btn:hover { opacity: 0.85; }

/* CTA */
.cta-section { padding: 7rem clamp(1.25rem, 4vw, 3rem); text-align: center; position: relative; overflow: hidden; }
.cta-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(37,99,255,0.12) 0%, transparent 70%); pointer-events: none; }
.cta-section h2 { font-family: 'Instrument Serif', serif; font-size: clamp(2.5rem,5vw,4rem); letter-spacing: -0.03em; line-height: 1.1; max-width: 640px; margin: 0 auto 1.5rem; position: relative; z-index: 1; }
.cta-section h2 em { font-style: italic; color: var(--accent2); }
.cta-section p { color: var(--muted); font-size: 1rem; margin-bottom: 2.5rem; position: relative; z-index: 1; }
.cta-input-row { display: flex; gap: 10px; max-width: 420px; margin: 0 auto; position: relative; z-index: 1; flex-wrap: wrap; justify-content: center; }
.cta-input { flex: 1; min-width: 200px; background: rgba(255,255,255,0.07); border: 1px solid var(--border); border-radius: 100px; padding: 0.85rem 1.25rem; color: var(--white); font-size: 0.9rem; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; }
.cta-input:focus { border-color: rgba(37,99,255,0.5); }
.cta-input::placeholder { color: var(--muted); }

/* Footer */
footer.nv-footer { padding: 2rem clamp(1.25rem, 4vw, 3rem); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
.footer-copy { font-size: 0.8rem; color: var(--muted); }
.footer-links { display: flex; gap: 1.5rem; }
.footer-links a, .footer-links button { font-size: 0.8rem; color: var(--muted); text-decoration: none; transition: color 0.2s; background: none; border: none; padding: 0; cursor: none; font-family: inherit; }
.footer-links a:hover, .footer-links button:hover { color: var(--white); }

/* Scroll reveal */
.reveal { opacity: 0; transform: translateY(20px); transition: all 0.6s ease; }
.reveal.visible { opacity: 1; transform: translateY(0); }

/* Keyboard navigation — visible focus without affecting pointer users */
.naviio-page a:focus-visible, .naviio-page button:focus-visible, .naviio-page input:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px;
}

/* Reduced motion: content must never depend on the reveal animation */
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
  .grid-bg, .orb, .badge-pulse { animation: none; }
  .hero-badge, .hero h1, .hero-sub, .hero-ctas, .hero-visual { animation: none; opacity: 1; transform: none; }
}

/* ─── Logo sizing — fluid, so the fixed nav never towers over the page ── */
.nv-logo { height: clamp(48px, 5.5vw, 64px); width: auto; object-fit: contain; }
.footer-logo { height: 52px; width: auto; object-fit: contain; }

/* ─── Touch devices: restore native cursor, hide the custom one ───────── */
@media (hover: none), (pointer: coarse) {
  .naviio-page { cursor: auto; }
  .cursor { display: none; }
  .naviio-page a, .naviio-page button, .naviio-page input,
  .footer-links a, .footer-links button { cursor: pointer; }
  .btn-primary:hover, .pricing-card:hover, .feature-card:hover,
  .int-pill:hover, .nv-links a.nv-cta:hover { transform: none; }
  /* Comfortable tap targets (~44px) on touch screens */
  .nv-links a.nv-cta { padding: 0.7rem 1.4rem; }
  .btn-primary { padding: 0.95rem 2rem; }
  .footer-links a, .footer-links button { padding: 0.5rem 0.25rem; }
}

/* ─── Tablet & down ──────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .hero { padding: 6.5rem 1.25rem 3rem; min-height: auto; }
  .hero-sub { font-size: 1rem; }
  .hero-ctas { margin-top: 2rem; }
  .hero-visual { margin-top: 3rem; }
  .logos-strip { padding: 3.5rem 1.25rem 2rem; }
  .logos-row { gap: 1.25rem 2rem; }
  .features, .integrations, .pricing { padding: 4rem 1.25rem; }
  .cta-section { padding: 4.5rem 1.25rem; }
  .section-title { margin-bottom: 2.5rem; }
  .feature-card { padding: 1.5rem; }
}

/* ─── Large phones & down ────────────────────────────────────────────── */
@media (max-width: 560px) {
  .orb-1 { width: 280px; height: 280px; filter: blur(60px); }
  .orb-2 { width: 220px; height: 220px; filter: blur(60px); }
  .cta-input-row { flex-direction: column; }
  .cta-input { min-width: 0; width: 100%; }
  footer.nv-footer { flex-direction: column; text-align: center; gap: 1rem; padding: 2rem 1.25rem calc(2rem + env(safe-area-inset-bottom)); }
  .footer-links { justify-content: center; flex-wrap: wrap; gap: 1.25rem; }
}

/* ─── 3D hero scene ──────────────────────────────────────────────────── */
.hv-scene { position: relative; perspective: 1600px; padding: 1rem 0 3.5rem; }
.hv-glow { position: absolute; inset: -15% -10%; background:
  radial-gradient(40% 50% at 30% 30%, rgba(37,99,255,0.22), transparent 70%),
  radial-gradient(35% 45% at 75% 60%, rgba(6,214,160,0.14), transparent 70%);
  filter: blur(40px); pointer-events: none; }

.hv-main { position: relative; transform: rotateX(11deg) rotateY(-9deg) rotateZ(0.5deg); transform-style: preserve-3d;
  background: linear-gradient(160deg, rgba(28,35,64,0.92), rgba(10,14,26,0.96));
  border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; padding: 1.25rem;
  box-shadow: 0 60px 120px rgba(0,0,0,0.55), 0 25px 50px rgba(13,27,55,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
  transition: transform 0.6s cubic-bezier(0.22,1,0.36,1); will-change: transform; }
.hv-scene:hover .hv-main { transform: rotateX(4deg) rotateY(-3deg) scale(1.012); }

.hv-topbar { display: flex; align-items: center; gap: 12px; padding-bottom: 0.9rem; border-bottom: 1px solid rgba(255,255,255,0.07); }
.hv-brand { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 0.85rem; letter-spacing: 0.02em; }
.hv-brand-dot { width: 9px; height: 9px; border-radius: 3px; background: linear-gradient(135deg, var(--accent), var(--accent2)); }
.hv-route { font-size: 0.78rem; color: var(--muted); }
.hv-live { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--accent2);
  background: rgba(6,214,160,0.1); border: 1px solid rgba(6,214,160,0.25); border-radius: 100px; padding: 0.2rem 0.65rem; }

.hv-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7rem; margin: 0.9rem 0; }
.hv-kpi { background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 0.75rem 0.85rem; display: flex; flex-direction: column; gap: 3px; }
.hv-kpi-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
.hv-kpi-value { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; }
.hv-kpi-delta { font-size: 0.68rem; color: var(--muted); }

.hv-chart { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 0.8rem 0.85rem 0.4rem; }
.hv-chart-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5rem; }
.hv-chart-tag { background: rgba(37,99,255,0.16); color: #93b4ff; border-radius: 6px; padding: 0.1rem 0.45rem; letter-spacing: 0.04em; }
.hv-chart svg { width: 100%; height: 110px; display: block; }
.hv-line { stroke-dasharray: 620; stroke-dashoffset: 620; animation: hvDraw 2.2s 0.7s cubic-bezier(0.4,0,0.2,1) forwards; }
.hv-line-dot { opacity: 0; animation: hvDotIn 0.4s 2.7s ease forwards; }
@keyframes hvDraw { to { stroke-dashoffset: 0; } }
@keyframes hvDotIn { to { opacity: 1; } }

.hv-variance { display: flex; align-items: center; gap: 1.1rem; flex-wrap: wrap; margin-top: 0.9rem; padding: 0.6rem 0.85rem;
  background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; font-size: 0.74rem; color: var(--muted); }
.hv-variance-title { font-weight: 600; color: var(--white); font-size: 0.72rem; }
.hv-variance-row em { font-style: normal; font-weight: 600; margin-left: 4px; }

.hv-card { position: absolute; display: flex; align-items: center; gap: 10px;
  background: linear-gradient(135deg, #1c2340, #0a0e1a); border: 1px solid rgba(37,99,255,0.35); border-radius: 12px;
  padding: 0.7rem 1rem; box-shadow: 0 18px 40px rgba(0,0,0,0.45); font-size: 0.78rem; }
.hv-card strong { display: block; font-size: 0.8rem; }
.hv-card span { display: block; color: var(--muted); font-size: 0.7rem; margin-top: 1px; }

.hv-card-trust { top: 4%; right: -1.5%; transform: translateZ(70px); border-color: rgba(6,214,160,0.4); animation: hvFloatA 7s 1s ease-in-out infinite; }
.hv-check { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; background: rgba(6,214,160,0.16); color: var(--accent2); display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; }

.hv-card-forecast { left: -2.5%; top: 38%; transform: translateZ(55px); animation: hvFloatB 8.5s 0.4s ease-in-out infinite; }
.hv-spark { width: 64px; height: 24px; flex-shrink: 0; }

.hv-card-navi { right: 4%; bottom: 1.25rem; transform: translateZ(85px); max-width: min(380px, 86%); animation: hvFloatA 9s 1.8s ease-in-out infinite; }

@keyframes hvFloatA { 0%,100% { margin-top: 0; } 50% { margin-top: -7px; } }
@keyframes hvFloatB { 0%,100% { margin-top: 0; } 50% { margin-top: 6px; } }

/* Touch devices have no hover — give the panel autonomous motion instead:
   a slow 3D sway that keeps the scene alive without a pointer. */
@keyframes hvSway {
  0%   { transform: rotateX(8deg) rotateY(-7deg) rotateZ(0.4deg); }
  50%  { transform: rotateX(4deg) rotateY(3deg) rotateZ(-0.3deg); }
  100% { transform: rotateX(8deg) rotateY(-7deg) rotateZ(0.4deg); }
}
@keyframes hvSwaySm {
  0%   { transform: rotateX(5deg) rotateY(-4deg); }
  50%  { transform: rotateX(2deg) rotateY(3deg); }
  100% { transform: rotateX(5deg) rotateY(-4deg); }
}
@media (max-width: 768px) {
  .hv-main { animation: hvSway 9s ease-in-out infinite; }
  .hv-card-trust { right: 0; }
  .hv-card-forecast { left: -1%; }
}
/* Phones: SAME composition as desktop — tilted, swaying panel with cards
   floating over it — just scaled to fit. */
@media (max-width: 560px) {
  .hv-scene { padding: 1.25rem 0 2.75rem; perspective: 1000px; }
  .hv-main { animation: hvSwaySm 8s ease-in-out infinite; padding: 0.9rem; }
  .hv-kpis { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .hv-kpi:nth-child(3) { grid-column: span 2; } /* no orphan cell in the 2-col grid */
  .hv-kpi-value { font-size: 1rem; }
  .hv-chart svg { height: 84px; }
  .hv-card { padding: 0.55rem 0.8rem; font-size: 0.7rem; }
  .hv-card strong { font-size: 0.72rem; }
  .hv-card span { font-size: 0.62rem; }
  .hv-card-trust { top: -10px; right: 0; }
  .hv-card-forecast { display: none; }
  .hv-card-navi { right: 0; bottom: 0.2rem; max-width: 88%; }
  .ai-icon { width: 22px; height: 22px; font-size: 0.7rem; }
}
@media (prefers-reduced-motion: reduce) {
  .hv-card, .hv-line, .hv-line-dot, .hv-main { animation: none; }
  .hv-line { stroke-dashoffset: 0; }
  .hv-line-dot { opacity: 1; }
  .hv-main, .hv-scene:hover .hv-main { transition: none; }
}

/* ─── Small phones ───────────────────────────────────────────────────── */
@media (max-width: 430px) {
  nav.nv { padding: 0.7rem max(1rem, env(safe-area-inset-left)) 0.7rem max(1rem, env(safe-area-inset-right)); }
  .nv-logo { height: 44px; }
  .footer-logo { height: 40px; }
  .features, .integrations, .pricing, .cta-section { scroll-margin-top: 68px; }
  .hero { padding: 5.25rem 1.1rem 2.5rem; }
  .hero-badge { font-size: 0.72rem; padding: 0.35rem 0.9rem; margin-bottom: 1.5rem; }
  .hero h1 { font-size: clamp(2.4rem, 11vw, 3.4rem); }
  .hero-sub { font-size: 0.95rem; margin-top: 1.1rem; }
  .hero-ctas { width: 100%; flex-direction: column; gap: 0.85rem; }
  .hero-ctas .btn-primary { width: 100%; text-align: center; }
  .logos-row { gap: 1rem 1.5rem; }
  .logo-item { font-size: 0.85rem; }
  .int-pill { font-size: 0.8rem; padding: 0.45rem 1rem; }
  .pricing-card { padding: 1.5rem; }
}
`

export default function LandingPage() {
  const [legalDoc, setLegalDoc] = useState<DocKey | null>(null)

  useEffect(() => {
    // Cursor
    const dot = document.querySelector<HTMLElement>('.cursor-dot')
    const ring = document.querySelector<HTMLElement>('.cursor-ring')
    if (!dot || !ring) return
    let mx = 0, my = 0, rx = 0, ry = 0
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY
      dot.style.left = mx + 'px'; dot.style.top = my + 'px'
    }
    document.addEventListener('mousemove', onMove)
    let raf: number
    const animRing = () => {
      rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12
      ring.style.left = rx + 'px'; ring.style.top = ry + 'px'
      raf = requestAnimationFrame(animRing)
    }
    raf = requestAnimationFrame(animRing)
    document.querySelectorAll('a, button, input').forEach(el => {
      el.addEventListener('mouseenter', () => { ring.style.transform = 'translate(-50%,-50%) scale(1.6)'; ring.style.borderColor = 'rgba(6,214,160,0.6)' })
      el.addEventListener('mouseleave', () => { ring.style.transform = 'translate(-50%,-50%) scale(1)'; ring.style.borderColor = 'rgba(37,99,255,0.5)' })
    })
    // Scroll reveal
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) } })
    }, { threshold: 0.1 })
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el))
    return () => {
      document.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
      obs.disconnect()
    }
  }, [])

  return (
    <div className="naviio-page">
      <style>{CSS}</style>

      <div className="cursor">
        <div className="cursor-dot" />
        <div className="cursor-ring" />
      </div>

      {/* Nav */}
      <nav className="nv">
        <img src="/naviio-logo.png" alt="Naviio" className="nv-logo" />
        <div className="nv-links">
          <a href="#features">Features</a>
          <a href="#integrations">Integrations</a>
          <a href="#pricing">Pricing</a>
          <a href="#waitlist" className="nv-cta">Get early access</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="grid-bg" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="hero-badge">
          <span className="badge-pulse" />
          Now in private beta — Q4 2026 launch
        </div>
        <h1>Your <em>financial<br />co-pilot</em> for growth</h1>
        <p className="hero-sub">Naviio is the financial tool whose numbers you can defend — to your co-founder, your board, and your accountant. No spreadsheets. No waiting.</p>
        <div className="hero-ctas">
          <a href="#waitlist" className="btn-primary">Join the waitlist</a>
          <a href="#features" className="btn-ghost">See how it works <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
        </div>

        <div className="hero-visual">
          {/* 3D product scene — live UI composition, not a screenshot */}
          <div
            className="hv-scene"
            role="img"
            aria-label="Naviio dashboard preview: live cash, MRR and runway metrics, a cash-flow chart, budget-vs-actuals variance, sync freshness, and an AI insight from Navi"
          >
            <div className="hv-glow" aria-hidden="true" />

            {/* Main dashboard panel (tilted in 3D) */}
            <div className="hv-main" aria-hidden="true">
              <div className="hv-topbar">
                <span className="hv-brand"><span className="hv-brand-dot" />Naviio</span>
                <span className="hv-route">Overview</span>
                <span className="hv-live"><span className="badge-pulse" />Live</span>
              </div>

              <div className="hv-kpis">
                <div className="hv-kpi">
                  <span className="hv-kpi-label">Cash on hand</span>
                  <span className="hv-kpi-value">$482,310</span>
                  <span className="hv-kpi-delta up">▲ 2.4% this month</span>
                </div>
                <div className="hv-kpi">
                  <span className="hv-kpi-label">MRR</span>
                  <span className="hv-kpi-value">$36,200</span>
                  <span className="hv-kpi-delta up">▲ 8.1% MoM</span>
                </div>
                <div className="hv-kpi">
                  <span className="hv-kpi-label">Runway</span>
                  <span className="hv-kpi-value">14.2 mo</span>
                  <span className="hv-kpi-delta">at current burn</span>
                </div>
              </div>

              <div className="hv-chart">
                <div className="hv-chart-head">
                  <span>Cash flow — trailing 12 months</span>
                  <span className="hv-chart-tag">TTM</span>
                </div>
                <svg viewBox="0 0 320 110" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="hvArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[22, 44, 66, 88].map((y) => (
                    <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  ))}
                  <path
                    d="M0,86 C28,80 46,84 72,70 C100,55 122,62 150,48 C178,35 200,42 228,28 C256,16 280,22 320,9 L320,110 L0,110 Z"
                    fill="url(#hvArea)"
                  />
                  <path
                    className="hv-line"
                    d="M0,86 C28,80 46,84 72,70 C100,55 122,62 150,48 C178,35 200,42 228,28 C256,16 280,22 320,9"
                    fill="none"
                    stroke="#06d6a0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle className="hv-line-dot" cx="320" cy="9" r="3.5" fill="#06d6a0" />
                </svg>
              </div>

              <div className="hv-variance">
                <span className="hv-variance-title">Budget vs Actuals · May</span>
                <span className="hv-variance-row">Revenue <em className="up">+$4.2K</em></span>
                <span className="hv-variance-row">OpEx <em className="up">−$1.8K</em></span>
                <span className="hv-variance-row">On plan ✓</span>
              </div>
            </div>

            {/* Floating satellite cards (depth layers) */}
            <div className="hv-card hv-card-trust" aria-hidden="true">
              <span className="hv-check">✓</span>
              <div>
                <strong>Numbers verified</strong>
                <span>Bank + Stripe · synced 2m ago</span>
              </div>
            </div>

            <div className="hv-card hv-card-forecast" aria-hidden="true">
              <div>
                <strong>12-mo forecast</strong>
                <span>$1.2M ARR · GM 71%</span>
              </div>
              <svg viewBox="0 0 64 24" className="hv-spark">
                <path d="M0,20 L10,17 L20,18 L30,12 L40,13 L50,7 L64,3" fill="none" stroke="#6096ff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            <div className="hv-card hv-card-navi" aria-hidden="true">
              <div className="ai-icon">✦</div>
              <div className="ai-text">Your burn rate increased 8% — <strong>raise or cut $12K in SaaS?</strong><span>Navi · just now</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos */}
      <div className="logos-strip reveal">
        <div className="logos-label">Trusted by founders using</div>
        <div className="logos-row">
          {['Stripe','QuickBooks','Plaid','Xero','Gusto','Shopify','HubSpot'].map(l => (
            <span className="logo-item" key={l}>{l}</span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="features" id="features">
        <div className="reveal">
          <div className="section-tag">What Naviio does</div>
          <h2 className="section-title">Everything a CFO tracks, <em>automated</em></h2>
        </div>
        <div className="features-grid reveal">
          {[
            { icon: '📊', name: 'Real-time P&L', desc: 'Income statement updates automatically as transactions hit. No manual reconciliation, no waiting on month-end closes.' },
            { icon: '💧', name: 'Cash flow & runway', desc: 'Live cash position, daily burn rate, and projected runway across every connected bank account.' },
            { icon: '📈', name: 'Revenue intelligence', desc: 'MRR, ARR, churn, LTV, and cohort analysis pulled directly from Stripe and Shopify — no spreadsheet needed.' },
            { icon: '🤖', name: 'AI categorization', desc: 'Transactions are auto-categorized using AI, with custom rules and one-click overrides when it needs your input.' },
            { icon: '🔮', name: 'Forecasting engine', desc: 'AI-generated 3, 6, and 12-month forecasts with scenario modeling. See best case, base case, and worst case in one view.' },
            { icon: '📋', name: 'Board-ready reports', desc: 'One-click export of investor-grade financial packages in PDF or slides. Built for how VCs and board members actually read numbers.' },
          ].map(({ icon, name, desc }) => (
            <div className="feature-card" key={name}>
              <div className="feature-icon">{icon}</div>
              <div className="feature-name">{name}</div>
              <div className="feature-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section className="integrations" id="integrations">
        <div className="reveal">
          <div className="section-tag">Integrations</div>
          <h2 className="section-title" style={{ textAlign: 'center' }}>Plugs into <em>your stack</em> in minutes</h2>
          <p className="section-sub">OAuth-only. No credentials stored. No technical setup required.</p>
        </div>
        <div className="int-grid reveal">
          {['Plaid ✦ Launch','QuickBooks ✦ Launch','Stripe ✦ Launch','Xero ✦ Launch'].map(l => <span className="int-pill launch" key={l}>{l}</span>)}
          {['Gusto','ADP','Shopify','HubSpot','Salesforce','Ramp','Brex','Bill.com','Amazon Seller'].map(l => <span className="int-pill" key={l}>{l}</span>)}
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing" id="pricing">
        <div className="reveal">
          <div className="section-tag">Pricing</div>
          <h2 className="section-title">CFO-level clarity, <em>not CFO prices</em></h2>
        </div>
        <div className="pricing-grid reveal">
          {[
            { tier: 'Starter', price: '$49', desc: 'For early-stage founders and solopreneurs getting started.', features: ['2 integrations','Real-time P&L','Cash dashboard','Basic KPIs','1 user'], featured: false },
            { tier: 'Growth',  price: '$149', desc: 'For SMBs between $1M–$5M revenue who need the full picture.', features: ['5 integrations','Full dashboard','Forecasting engine','AI categorization','3 users'], featured: true },
            { tier: 'Pro',     price: '$349', desc: 'For $5M–$20M businesses that need scenario modeling and board reports.', features: ['Unlimited integrations','Board reports export','Scenario modeling','API access','10 users'], featured: false },
            { tier: 'CFO Suite', price: '$799', desc: 'For fractional CFOs managing multiple clients from one platform.', features: ['Multi-entity','White-label','Client portal','Priority support','Unlimited users'], featured: false },
          ].map(({ tier, price, desc, features, featured }) => (
            <div className={`pricing-card${featured ? ' featured' : ''}`} key={tier}>
              {featured && <div className="pricing-badge">Most popular</div>}
              <div className="pricing-tier">{tier}</div>
              <div className="pricing-price">{price}<span>/mo</span></div>
              <div className="pricing-desc">{desc}</div>
              <ul className="pricing-features">
                {features.map(f => <li key={f}><span className="check">✓</span>{f}</li>)}
              </ul>
              <a href="#waitlist" className="pricing-btn">Join the waitlist</a>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="waitlist">
        <h2>Ready to <em>fly with clarity?</em></h2>
        <p>Join the waitlist. Beta launches Q4 2026.</p>
        <WaitlistForm />
      </section>

      {/* Footer */}
      <footer className="nv-footer">
        <img src="/naviio-logo.png" alt="Naviio" className="footer-logo" />
        <div className="footer-copy">© 2026 Naviio. All rights reserved.</div>
        <div className="footer-links">
          <button type="button" onClick={() => setLegalDoc('privacy')}>Privacy</button>
          <button type="button" onClick={() => setLegalDoc('terms')}>Terms</button>
          <button type="button" onClick={() => setLegalDoc('contact')}>Contact</button>
        </div>
      </footer>

      {legalDoc && (
        <LegalModal
          doc={legalDoc}
          onClose={() => setLegalDoc(null)}
          onNavigate={setLegalDoc}
        />
      )}
    </div>
  )
}
