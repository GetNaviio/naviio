import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (compact && Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatNumber(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (compact && Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
  return new Intl.NumberFormat('en-US').format(value)
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Financial calculations ────────────────────────────────────────────────

export function calcGrowthRate(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / Math.abs(prior)) * 100
}

export function calcMarginPct(profit: number, revenue: number): number {
  if (revenue === 0) return 0
  return (profit / revenue) * 100
}

export function calcRunway(cashBalance: number, monthlyBurn: number): number {
  if (monthlyBurn <= 0) return Infinity
  return cashBalance / monthlyBurn
}

export function calcLtv(arpu: number, monthlyChurnRate: number): number {
  if (monthlyChurnRate <= 0) return 0
  return arpu / (monthlyChurnRate / 100)
}

export function calcMagicNumber(newArr: number, priorSmSpend: number): number {
  if (priorSmSpend === 0) return 0
  return newArr / priorSmSpend
}

export function calcRule40(revenueGrowthPct: number, ebitdaMarginPct: number): number {
  return revenueGrowthPct + ebitdaMarginPct
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
