/**
 * Persist a computed decision to the DecisionLog — the proprietary, compounding
 * dataset behind the moat (question, inputs, verdict; outcome captured later).
 *
 * Shared by the explicit decision route AND the Navi agent's run_decision tool so
 * agent-run decisions also feed the outcome loop / follow-up cron. Raw insert so
 * it works without regenerating the Prisma client in CI; never throws into the
 * caller (a logging failure must not break the response).
 */
import { prisma } from '@/lib/prisma'
import type { DecisionAnswer } from './types'

export async function persistDecision(args: {
  orgId: string
  userId: string
  template: string
  question?: string | null
  params: Record<string, unknown>
  answer: DecisionAnswer
}): Promise<string> {
  const id = crypto.randomUUID()
  await prisma.$executeRaw`
    INSERT INTO "DecisionLog" ("id","orgId","userId","template","question","verdict","headline","confidence","params","answer","createdAt")
    VALUES (${id}, ${args.orgId}, ${args.userId}, ${args.template}, ${args.question || null}, ${args.answer.verdict}, ${args.answer.headline}, ${args.answer.confidence}, ${JSON.stringify(args.params)}::jsonb, ${JSON.stringify(args.answer)}::jsonb, now())
  `.catch((e: unknown) => console.error('decision log persist failed (non-blocking):', e))
  return id
}
