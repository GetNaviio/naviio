-- Add a `product` discriminator to the waitlist so the same email can join both
-- the main app waitlist and the Naviio Card waitlist. Existing rows are the app
-- waitlist. Replace the single-column unique on email with a compound unique.
ALTER TABLE "Waitlist" ADD COLUMN "product" TEXT NOT NULL DEFAULT 'app';

DROP INDEX IF EXISTS "Waitlist_email_key";

CREATE UNIQUE INDEX "Waitlist_email_product_key" ON "Waitlist"("email", "product");
