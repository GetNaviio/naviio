import { getTokenForUser } from './refreshToken'

function gustoBase() {
  return process.env.GUSTO_ENV === 'production'
    ? 'https://api.gusto.com'
    : 'https://api.gusto-demo.com'
}

const GUSTO_AUTH_URL = 'https://api.gusto-demo.com/oauth/authorize'
const GUSTO_TOKEN_URL = 'https://api.gusto-demo.com/oauth/token'

export function getAuthUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GUSTO_CLIENT_ID ?? '',
    redirect_uri: process.env.GUSTO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/gusto/callback`,
    state,
  })
  return `${GUSTO_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(GUSTO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GUSTO_CLIENT_ID ?? '',
      client_secret: process.env.GUSTO_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.GUSTO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/gusto/callback`,
    }),
  })
  if (!res.ok) throw new Error(`Gusto token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
  }
}

async function gustoGet(accessToken: string, path: string) {
  const res = await fetch(`${gustoBase()}/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Gusto API ${res.status}: ${path}`)
  return res.json()
}

export async function fetchCurrentUser(accessToken: string) {
  const res = await fetch(`${gustoBase()}/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gusto /me failed: ${res.status}`)
  return res.json()
}

export async function fetchEmployees(userId: string) {
  const token = await getTokenForUser(userId, 'gusto')
  if (!token) return null
  const me = await fetchCurrentUser(token)
  const companyId = me?.roles?.payroll_admin?.companies?.[0]?.id
  if (!companyId) return null
  return gustoGet(token, `/companies/${companyId}/employees`)
}

export async function fetchPayrolls(userId: string) {
  const token = await getTokenForUser(userId, 'gusto')
  if (!token) return null
  const me = await fetchCurrentUser(token)
  const companyId = me?.roles?.payroll_admin?.companies?.[0]?.id
  if (!companyId) return null
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10)
  const endDate = now.toISOString().slice(0, 10)
  return gustoGet(token, `/companies/${companyId}/payrolls?start_date=${startDate}&end_date=${endDate}&processed=true`)
}

export async function fetchGustoData(userId: string) {
  const [employees, payrolls] = await Promise.allSettled([
    fetchEmployees(userId),
    fetchPayrolls(userId),
  ])

  const payrollList: Array<{ totals?: { company_debit?: string }; pay_period?: { end_date?: string } }> = payrolls.status === 'fulfilled' ? payrolls.value ?? [] : []
  const latestPayroll = payrollList[0]
  const totalPayrollCost = latestPayroll?.totals?.company_debit
    ? parseFloat(latestPayroll.totals.company_debit)
    : null

  const empList: unknown[] = employees.status === 'fulfilled' ? employees.value ?? [] : []

  return {
    source: 'gusto',
    headcount: empList.length,
    employees: employees.status === 'fulfilled' ? employees.value : null,
    payrolls: payrolls.status === 'fulfilled' ? payrolls.value : null,
    latestPayrollCost: totalPayrollCost,
    latestPayrollDate: latestPayroll?.pay_period?.end_date ?? null,
  }
}
