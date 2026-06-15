#!/usr/bin/env node
/**
 * Standalone Xero connectivity test — bypasses the app/dev server entirely.
 * Reads the stored XERO integration from the DB, refreshes the token if needed,
 * then calls /connections, /Reports/ProfitAndLoss, and /Invoices, printing the
 * real status + body for each so we can see exactly what's failing.
 *
 *   node scripts/xero-test.cjs
 */
require('dotenv/config')
const { Client } = require('pg')

const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const API = 'https://api.xero.com/api.xro/2.0'

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const { rows } = await db.query(
    `SELECT id, "orgId", "accessToken", "refreshToken", "realmId", "expiresAt", status
       FROM "Integration" WHERE provider = 'XERO' ORDER BY "updatedAt" DESC LIMIT 1`,
  )
  if (rows.length === 0) {
    console.log('No XERO integration row found. Connect Xero first.')
    await db.end()
    return
  }
  const int = rows[0]
  const expired = int.expiresAt && new Date(int.expiresAt).getTime() < Date.now()
  console.log('\n── Stored integration ──')
  console.log('  status      :', int.status)
  console.log('  realmId     :', int.realmId || '(none)')
  console.log('  accessToken :', int.accessToken ? `${int.accessToken.slice(0, 12)}…` : '(none)')
  console.log('  refreshToken:', int.refreshToken ? 'present' : '(none)')
  console.log('  expiresAt   :', int.expiresAt, expired ? '→ EXPIRED' : '→ valid')

  let token = int.accessToken

  // Refresh if expired (or always, to prove the refresh path works).
  if (expired && int.refreshToken) {
    console.log('\n── Refreshing token ──')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: int.refreshToken }),
    })
    const body = await res.text()
    console.log('  refresh status:', res.status)
    if (res.ok) {
      const data = JSON.parse(body)
      token = data.access_token
      console.log('  → got a new access token')
      await db.query(
        `UPDATE "Integration" SET "accessToken"=$1, "refreshToken"=$2, "expiresAt"=$3, status='CONNECTED' WHERE id=$4`,
        [data.access_token, data.refresh_token, new Date(Date.now() + data.expires_in * 1000), int.id],
      )
      console.log('  → DB updated with refreshed token + status CONNECTED')
    } else {
      console.log('  refresh FAILED body:', body.slice(0, 300))
      await db.end()
      return
    }
  }

  // 1) Connections → tenant id
  console.log('\n── /connections ──')
  const cRes = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  console.log('  status:', cRes.status)
  const conns = cRes.ok ? await cRes.json() : []
  if (!cRes.ok) { console.log('  body:', (await cRes.text()).slice(0, 300)) }
  console.log('  tenants:', JSON.stringify(conns.map((c) => ({ id: c.tenantId, name: c.tenantName, type: c.tenantType }))))
  const tenantId = int.realmId || conns[0]?.tenantId
  if (!tenantId) { console.log('  → no tenant id; stopping.'); await db.end(); return }

  // 2) Profit and Loss
  const year = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  await report(token, tenantId, `/Reports/ProfitAndLoss?fromDate=${year}-01-01&toDate=${today}`, 'ProfitAndLoss')

  // 3) Invoices
  console.log('\n── /Invoices (AUTHORISED) ──')
  const iRes = await fetch(`${API}/Invoices?where=Status=="AUTHORISED"`, {
    headers: { Authorization: `Bearer ${token}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
  })
  console.log('  status:', iRes.status)
  const iBody = await iRes.text()
  if (iRes.ok) {
    const data = JSON.parse(iBody)
    console.log('  invoice count:', (data.Invoices || []).length)
  } else {
    console.log('  body:', iBody.slice(0, 400))
  }

  await db.end()
  console.log('\nDone.\n')
}

async function report(token, tenantId, path, label) {
  console.log(`\n── /Reports/${label} ──`)
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
  })
  console.log('  status:', res.status)
  const body = await res.text()
  if (!res.ok) { console.log('  body:', body.slice(0, 500)); return }
  const rep = JSON.parse(body).Reports?.[0]
  console.log('  report name:', rep?.ReportName)
  console.log('  section titles:', JSON.stringify((rep?.Rows || []).map((r) => r.Title || r.RowType).filter(Boolean)))
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
