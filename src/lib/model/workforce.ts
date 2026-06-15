/**
 * Workforce planning math — pure, unit-testable.
 *
 * A role contributes `headcount × monthlySalary × (1 + loadedPct/100)` for
 * every month m with startMonth ≤ m ≤ endMonth (endMonth null = ongoing).
 * Months are 'YYYY-MM' strings, which order lexically.
 */

export interface PlannedRole {
  title: string
  headcount: number
  monthlySalary: number
  /** Employer taxes / benefits / tooling uplift, percent (25 = +25%). */
  loadedPct: number
  startMonth: string // 'YYYY-MM'
  endMonth?: string | null // inclusive; null/undefined = ongoing
}

/** Fully-loaded monthly cost of one role (all seats). */
export function loadedMonthlyCost(role: PlannedRole): number {
  return role.headcount * role.monthlySalary * (1 + role.loadedPct / 100)
}

export function roleActiveInMonth(role: PlannedRole, ym: string): boolean {
  if (ym < role.startMonth) return false
  if (role.endMonth && ym > role.endMonth) return false
  return true
}

/** Total loaded workforce cost for one month. */
export function workforceCostForMonth(roles: PlannedRole[], ym: string): number {
  return roles.reduce((sum, r) => sum + (roleActiveInMonth(r, ym) ? loadedMonthlyCost(r) : 0), 0)
}

/** Total planned headcount active in a month. */
export function headcountForMonth(roles: PlannedRole[], ym: string): number {
  return roles.reduce((sum, r) => sum + (roleActiveInMonth(r, ym) ? r.headcount : 0), 0)
}

/** 'YYYY-MM' for a Date (UTC). */
export function ymOfDate(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** `count` consecutive 'YYYY-MM' keys starting at `start` (inclusive). */
export function monthKeys(start: string, count: number): string[] {
  const [y, m] = start.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    return ymOfDate(d)
  })
}

/** Cost + headcount series over a set of months. */
export function workforceSeries(
  roles: PlannedRole[],
  months: string[],
): { month: string; cost: number; headcount: number }[] {
  return months.map((month) => ({
    month,
    cost: workforceCostForMonth(roles, month),
    headcount: headcountForMonth(roles, month),
  }))
}
