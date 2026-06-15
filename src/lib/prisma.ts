import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { encryptSecret, decryptSecret } from './crypto'

// Integration fields holding provider secrets — transparently encrypted at rest
// at the application layer (SEC-POL-001 §3.1) via the Prisma extension below.
const SECRET_FIELDS = ['accessToken', 'refreshToken'] as const

type Mutable = Record<string, unknown>

function encryptFields(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const obj = data as Mutable
  for (const f of SECRET_FIELDS) {
    const v = obj[f]
    if (typeof v === 'string' && v.length > 0) obj[f] = encryptSecret(v)
  }
}

function decryptFields(row: unknown): void {
  if (!row || typeof row !== 'object') return
  const obj = row as Mutable
  for (const f of SECRET_FIELDS) {
    const v = obj[f]
    if (typeof v === 'string' && v.length > 0) obj[f] = decryptSecret(v)
  }
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL || ''
  const adapter = new PrismaPg({ connectionString })
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  // Transparent field-level encryption for Integration secret tokens: encrypt on
  // every write, decrypt on every read. Centralized here so all 8 integrations
  // (Plaid, Stripe, QuickBooks, Xero, Gusto, ADP, Shopify, GoHighLevel) are
  // covered without per-integration code. Legacy plaintext rows pass through and
  // are re-encrypted on their next write.
  return base.$extends({
    // Money is stored as exact Decimal in Postgres (no IEEE 754 drift at rest).
    // At the read boundary we convert to JS number so app code does plain
    // arithmetic. Writes accept number | string | Decimal natively.
    result: {
      transaction: {
        amount: {
          needs: { amount: true },
          compute: ({ amount }) => Number(amount),
        },
      },
      mrrSnapshot: {
        mrr: {
          needs: { mrr: true },
          compute: ({ mrr }) => Number(mrr),
        },
      },
      workforceRole: {
        monthlySalary: {
          needs: { monthlySalary: true },
          compute: ({ monthlySalary }) => Number(monthlySalary),
        },
      },
      budgetLine: {
        amount: {
          needs: { amount: true },
          compute: ({ amount }) => Number(amount),
        },
      },
      adInsight: {
        spend: {
          needs: { spend: true },
          compute: ({ spend }) => Number(spend),
        },
        conversionValue: {
          needs: { conversionValue: true },
          compute: ({ conversionValue }) => (conversionValue == null ? null : Number(conversionValue)),
        },
      },
    },
    query: {
      integration: {
        async $allOperations({ operation, args, query }) {
          const a = args as Mutable
          if (operation === 'upsert') {
            encryptFields(a.create)
            encryptFields(a.update)
          } else if (operation === 'createMany' || operation === 'updateMany') {
            if (Array.isArray(a.data)) a.data.forEach(encryptFields)
            else encryptFields(a.data)
          } else if (operation === 'create' || operation === 'update') {
            encryptFields(a.data)
          }

          const result = await query(args)

          if (Array.isArray(result)) result.forEach(decryptFields)
          else decryptFields(result)
          return result
        },
      },
    },
  })
}

type PrismaClientInstance = ReturnType<typeof createPrismaClient>
const globalForPrisma = globalThis as unknown as { prisma: PrismaClientInstance }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
