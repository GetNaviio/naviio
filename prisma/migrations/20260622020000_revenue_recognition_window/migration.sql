-- Revenue-recognition service window. When a subscription charge covers a
-- multi-month period (annual/quarterly), revenue is recognized ratably across
-- [recognitionStart, recognitionEnd] (deferred revenue). NULL → recognized on date.
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "recognitionStart" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "recognitionEnd" TIMESTAMP(3);
