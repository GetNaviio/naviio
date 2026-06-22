-- Clean up the firm-workflow test data. Run in Neon → SQL Editor (production).
-- Reverts "Client Support" (hello@naviio.com) back to an individual account:
--   • removes advisor access to the test client org
--   • deletes the Firm (cascades the accepted ClientInvite + any FirmMember rows;
--     sets the client org's firmId back to NULL)
-- Leaves the eric@naviio.com account and the "Acme Test Co" org intact as a
-- standalone account (delete those separately if you also want them gone).

BEGIN;

-- 1) Remove advisor memberships on this firm's client orgs.
DELETE FROM "OrgMember" m
USING "Organization" o, "Firm" f, "User" u
WHERE m."orgId" = o."id"
  AND o."firmId" = f."id"
  AND f."ownerUserId" = u."id"
  AND u."email" = 'hello@naviio.com'
  AND m."role"::text = 'ADVISOR';

-- 2) Delete the firm (cascades ClientInvite + FirmMember; nulls Organization.firmId).
DELETE FROM "Firm" f
USING "User" u
WHERE f."ownerUserId" = u."id"
  AND u."email" = 'hello@naviio.com';

COMMIT;
