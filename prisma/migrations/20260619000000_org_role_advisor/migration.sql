-- Add the ADVISOR role (fractional CFO / CPA access to a client org).
-- Kept in its own migration so the new enum value is committed before any
-- migration references it (Postgres requires ADD VALUE to be visible first).
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'ADVISOR';
