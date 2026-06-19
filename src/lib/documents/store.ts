/**
 * DocumentSource + DocumentRef persistence (raw SQL, so no Prisma regeneration
 * needed). Tokens are encrypted with lib/crypto before storage — the Prisma
 * field-encryption extension only covers the Integration model, so we encrypt
 * here explicitly. File CONTENTS are never stored; DocumentRef holds metadata +
 * an outbound link only.
 */
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

export type DocProvider = 'dropbox' | 'google_drive'

export interface DocumentSourceRow {
  id: string
  provider: DocProvider
  accessToken: string | null
  refreshToken: string | null
  accountLabel: string | null
  rootPath: string
  expiresAt: Date | null
  status: string
}

function dec(v: string | null): string | null {
  if (!v) return null
  try {
    return decryptSecret(v)
  } catch {
    return null
  }
}

/** The org's connected source for a provider, with tokens decrypted. */
export async function getDocumentSource(orgId: string, provider: DocProvider): Promise<DocumentSourceRow | null> {
  const rows = await prisma.$queryRaw<DocumentSourceRow[]>(Prisma.sql`
    SELECT "id", "provider", "accessToken", "refreshToken", "accountLabel", "rootPath", "expiresAt", "status"
    FROM "DocumentSource" WHERE "orgId" = ${orgId} AND "provider" = ${provider} LIMIT 1
  `)
  const r = rows[0]
  if (!r) return null
  return { ...r, accessToken: dec(r.accessToken), refreshToken: dec(r.refreshToken) }
}

/** Upsert a connected source (encrypting tokens). */
export async function upsertDocumentSource(input: {
  orgId: string
  provider: DocProvider
  accessToken: string
  refreshToken?: string | null
  accountLabel?: string | null
  expiresAt?: Date | null
}): Promise<void> {
  const at = encryptSecret(input.accessToken)
  const rt = input.refreshToken ? encryptSecret(input.refreshToken) : null
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DocumentSource" ("id", "orgId", "provider", "accessToken", "refreshToken", "accountLabel", "expiresAt", "status", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${input.orgId}, ${input.provider}, ${at}, ${rt}, ${input.accountLabel ?? null}, ${input.expiresAt ?? null}, 'connected', now(), now())
    ON CONFLICT ("orgId", "provider") DO UPDATE SET
      "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = COALESCE(EXCLUDED."refreshToken", "DocumentSource"."refreshToken"),
      "accountLabel" = EXCLUDED."accountLabel",
      "expiresAt" = EXCLUDED."expiresAt",
      "status" = 'connected',
      "updatedAt" = now()
  `)
}

/** Persist a freshly-refreshed access token (keeps the same refresh token). */
export async function updateAccessToken(orgId: string, provider: DocProvider, accessToken: string, expiresAt: Date | null): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "DocumentSource" SET "accessToken" = ${encryptSecret(accessToken)}, "expiresAt" = ${expiresAt}, "updatedAt" = now()
    WHERE "orgId" = ${orgId} AND "provider" = ${provider}
  `)
}

export async function disconnectDocumentSource(orgId: string, provider: DocProvider): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "DocumentSource" SET "status" = 'disconnected', "accessToken" = NULL, "refreshToken" = NULL, "updatedAt" = now()
    WHERE "orgId" = ${orgId} AND "provider" = ${provider}
  `)
}

export interface DocumentRefRow {
  id: string
  provider: string
  externalId: string
  name: string
  path: string | null
  url: string | null
  sizeBytes: number | null
  sharedByUserId: string | null
  modifiedAt: Date | null
  createdAt: Date
}

export async function listDocumentRefs(orgId: string): Promise<DocumentRefRow[]> {
  return prisma.$queryRaw<DocumentRefRow[]>(Prisma.sql`
    SELECT "id", "provider", "externalId", "name", "path", "url", "sizeBytes", "sharedByUserId", "modifiedAt", "createdAt"
    FROM "DocumentRef" WHERE "orgId" = ${orgId} ORDER BY "createdAt" DESC LIMIT 500
  `)
}

/** Share a file into the workspace (pointer only). Idempotent per (org,provider,externalId). */
export async function addDocumentRef(input: {
  orgId: string
  provider: DocProvider
  externalId: string
  name: string
  path?: string | null
  url?: string | null
  sizeBytes?: number | null
  modifiedAt?: Date | null
  sharedByUserId?: string | null
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DocumentRef" ("id", "orgId", "provider", "externalId", "name", "path", "url", "sizeBytes", "sharedByUserId", "modifiedAt", "createdAt")
    VALUES (${randomUUID()}, ${input.orgId}, ${input.provider}, ${input.externalId}, ${input.name}, ${input.path ?? null}, ${input.url ?? null}, ${input.sizeBytes ?? null}, ${input.sharedByUserId ?? null}, ${input.modifiedAt ?? null}, now())
    ON CONFLICT ("orgId", "provider", "externalId") DO UPDATE SET
      "name" = EXCLUDED."name", "path" = EXCLUDED."path", "url" = EXCLUDED."url",
      "sizeBytes" = EXCLUDED."sizeBytes", "modifiedAt" = EXCLUDED."modifiedAt"
  `)
}

export async function removeDocumentRef(orgId: string, id: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "DocumentRef" WHERE "orgId" = ${orgId} AND "id" = ${id}`)
}
