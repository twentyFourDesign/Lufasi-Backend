-- Run once on Supabase / Postgres if extras table exists without these columns.
-- Booking extras step reads categoryTitle / categorySubtitle from any extra in the category.

ALTER TABLE extras
  ADD COLUMN IF NOT EXISTS "categoryTitle" VARCHAR(200);

ALTER TABLE extras
  ADD COLUMN IF NOT EXISTS "categorySubtitle" TEXT;
