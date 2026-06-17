/**
 * Natural-language → decision intent (V2 layer).
 *
 * Maps a typed question ("can we afford this $240k lease in 3 months?") to a
 * template + the parameters the user *stated*. It only extracts numbers the
 * user gave — it never invents financial figures (the engine computes those).
 * Deterministic and unit-tested; an LLM extractor can layer on top for broader
 * phrasings, but this is the reliable floor.
 */
import type { DecisionTemplate } from './types'

const MULT: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, bn: 1e9, billion: 1e9,
}

/** Money amounts the user stated. Includes a token only if it has a `$`, a
 * magnitude suffix (k/m/million…), or is itself ≥ 1000 — so "3 months", "8%",
 * and "15 units" are not mistaken for dollars. */
export function parseMoney(text: string): number[] {
  const out: number[] = []
  // Suffix must be its own token (\b) so the "m" in "machine" isn't read as "million".
  const re = /(\$)?\s?(\d[\d,]*(?:\.\d+)?)(?:\s*(k|mm|m|thousand|million|bn|billion))?\b/gi
  let mt: RegExpExecArray | null
  while ((mt = re.exec(text)) !== null) {
    const hasDollar = !!mt[1]
    let num = parseFloat(mt[2].replace(/,/g, ''))
    const suffix = mt[3]?.toLowerCase()
    if (!Number.isFinite(num)) continue
    if (suffix) num *= MULT[suffix]
    if (hasDollar || suffix || num >= 1000) out.push(num)
  }
  return out
}

function parsePercent(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i)
  return m ? parseFloat(m[1]) : null
}

function parseMonths(text: string): number | null {
  const m =
    text.match(/(?:next|within|in|over|for)\s+(\d+)\s*months?/i) ||
    text.match(/(\d+)\s*-?\s*months?\b/i)
  return m ? parseInt(m[1], 10) : null
}

const RE = {
  capex: /\b(buy|bought|purchase|purchasing|equipment|machine|financ|apr|lease[- ]?to[- ]?own|invest in|good deal|laser|vehicle|truck|hardware|device)\b/i,
  afford: /\b(afford|can (we|i)|lease|rent|sign|take on|commit)\b/i,
  runway: /\b(runway|profitab|headcount|hir(e|ing)|burn|board|raise|fundrais|extend)\b/i,
}

function labelFrom(text: string): string | undefined {
  const t = text.toLowerCase()
  if (/laser|machine|equipment|device|hardware/.test(t)) return 'the equipment'
  if (/lease/.test(t)) return 'the lease'
  if (/rent/.test(t)) return 'the rent'
  if (/vehicle|truck|car/.test(t)) return 'the vehicle'
  if (/hire|headcount|role/.test(t)) return 'the hire'
  return undefined
}

export interface ParsedDecision {
  template: DecisionTemplate
  params: Record<string, number | string | undefined>
  /** Required params the user didn't provide — the UI should ask for these. */
  missing: string[]
  confidence: 'high' | 'medium' | 'low'
  /** True only when the text shows a real decision cue (afford / buy / runway…),
   * not the fallback. Lets the chat decide between a simple reply and a card. */
  isDecision: boolean
}

export function parseDecisionQuestion(text: string): ParsedDecision {
  const money = parseMoney(text)
  const percent = parsePercent(text)
  const months = parseMonths(text)
  const hasApr = /\bapr\b|financ/i.test(text)

  // Classify template (capex wins when financing/equipment cues are present).
  // `isDecision` is true only when a real cue matched — not the fallback — so the
  // chat doesn't turn an ordinary question ("what are my tax savings?") into a card.
  let template: DecisionTemplate
  let isDecision = true
  if (RE.capex.test(text) && (money.length > 0 || hasApr)) template = 'capex'
  else if (RE.afford.test(text)) template = 'affordability'
  else if (RE.runway.test(text)) template = 'runway_path'
  else { template = money.length > 0 ? 'affordability' : 'runway_path'; isDecision = money.length > 0 }

  const params: Record<string, number | string | undefined> = {}
  const missing: string[] = []

  if (template === 'affordability') {
    if (money[0] != null) params.amount = money[0]
    else missing.push('amount')
    if (months != null) params.horizonMonths = months
    const label = labelFrom(text)
    if (label) params.label = label
  } else if (template === 'capex') {
    if (money[0] != null) params.price = money[0]
    else missing.push('price')
    if (percent != null && hasApr) params.apr = percent / 100
    if (months != null && hasApr) params.termMonths = months
    const label = labelFrom(text)
    if (label) params.label = label
    // Unit economics almost never appear in a one-line question — ask for them.
    for (const k of ['avgRevenuePerUnit', 'grossMarginPct', 'unitsPerMonth']) missing.push(k)
  } else {
    // runway_path: no required params; current trajectory is enough.
    if (months != null) params.horizonMonths = months
  }

  const confidence: ParsedDecision['confidence'] =
    missing.length === 0 ? 'high' : missing.length <= 1 ? 'medium' : 'low'

  return { template, params, missing, confidence, isDecision }
}

// ── Multi-turn slot filling ─────────────────────────────────────────────────

/** Params each template needs before it can be computed. */
export const REQUIRED: Record<DecisionTemplate, string[]> = {
  affordability: ['amount'],
  capex: ['price', 'avgRevenuePerUnit', 'grossMarginPct', 'unitsPerMonth'],
  runway_path: [],
}

/** Which required params are still absent/invalid in a (partial) param set. */
export function missingParams(template: DecisionTemplate, params: Record<string, unknown>): string[] {
  return REQUIRED[template].filter((k) => {
    const v = params[k]
    return typeof v !== 'number' || !Number.isFinite(v)
  })
}

/**
 * Extract the values a user gave in a follow-up reply for the slots Navi is
 * still missing. Only reads numbers the user stated (gross margin as a %,
 * revenue as a $ amount, volume as a count) — never invents anything.
 */
export function extractSlots(template: DecisionTemplate, missing: string[], text: string): Record<string, number> {
  const out: Record<string, number> = {}
  const money = parseMoney(text)
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i)
  const recurring = /\/\s*mo|per month|monthly|a month/i.test(text)

  if (template === 'affordability') {
    if (money[0] != null) {
      if (recurring) { out.recurringMonthly = money[0]; out.amount = 0 }
      else out.amount = money[0]
    }
    return out
  }

  if (template === 'capex') {
    if (missing.includes('price') && money[0] != null) out.price = money[0]
    if (missing.includes('grossMarginPct') && pctMatch) out.grossMarginPct = parseFloat(pctMatch[1]) / 100
    if (missing.includes('avgRevenuePerUnit')) {
      // Prefer a $ amount that isn't the price we just took.
      const rev = money.find((m) => m !== out.price)
      if (rev != null) out.avgRevenuePerUnit = rev
    }
    if (missing.includes('unitsPerMonth')) {
      const cue = text.match(/(\d{1,4})\s*(?:per month|\/\s*mo|a month|monthly|treatments?|units?|sessions?|clients?)/i)
      if (cue) out.unitsPerMonth = parseInt(cue[1], 10)
      else if (money.length === 0 && !pctMatch) {
        const bare = text.trim().match(/^\s*(\d{1,4})\s*$/)
        if (bare) out.unitsPerMonth = parseInt(bare[1], 10)
      }
    }
  }
  return out
}
