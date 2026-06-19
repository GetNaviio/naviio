-- Fractional-CFO firm grouping, client invites, access audit, and external
-- document sharing (Dropbox / Google Drive). Files live OUTSIDE Naviio; only
-- the connection and pointers are stored here.

-- Firm (the CFO practice / white-label tenant grouping)
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandLogoUrl" TEXT,
    "brandColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Firm_ownerUserId_idx" ON "Firm"("ownerUserId");

-- Link a client org to the firm that manages it
ALTER TABLE "Organization" ADD COLUMN "firmId" TEXT;
CREATE INDEX "Organization_firmId_idx" ON "Organization"("firmId");
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Client invite (firm invites a prospective client; client owns their own login/org)
CREATE TABLE "ClientInvite" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "advisorUserId" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientName" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consentScopes" TEXT NOT NULL DEFAULT 'financials',
    "orgId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientInvite_tokenHash_key" ON "ClientInvite"("tokenHash");
CREATE INDEX "ClientInvite_firmId_idx" ON "ClientInvite"("firmId");
CREATE INDEX "ClientInvite_clientEmail_idx" ON "ClientInvite"("clientEmail");
ALTER TABLE "ClientInvite"
  ADD CONSTRAINT "ClientInvite_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Access audit (who touched which client org)
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessLog_orgId_createdAt_idx" ON "AccessLog"("orgId", "createdAt");
CREATE INDEX "AccessLog_actorUserId_idx" ON "AccessLog"("actorUserId");

-- External document source (OAuth connection to Dropbox / Drive; tokens app-encrypted)
CREATE TABLE "DocumentSource" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accountLabel" TEXT,
    "rootPath" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSource_orgId_provider_key" ON "DocumentSource"("orgId", "provider");
CREATE INDEX "DocumentSource_orgId_idx" ON "DocumentSource"("orgId");

-- Document pointer (metadata + outbound link only; file content stays external)
CREATE TABLE "DocumentRef" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "url" TEXT,
    "sizeBytes" INTEGER,
    "sharedByUserId" TEXT,
    "modifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentRef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentRef_orgId_provider_externalId_key" ON "DocumentRef"("orgId", "provider", "externalId");
CREATE INDEX "DocumentRef_orgId_idx" ON "DocumentRef"("orgId");
