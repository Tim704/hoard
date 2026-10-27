-- Converts the integer rating columns to DOUBLE PRECISION so scores can have one
-- decimal. Runs on every container start BEFORE `prisma db push`, so db push
-- sees the column already matches the schema (Float) and plans no destructive
-- change. Idempotent: skips columns that are already converted, and does
-- nothing when the table doesn't exist yet (fresh database).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['UserMediaActivity', 'Franchise'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = t
        AND column_name = 'rating'
        AND data_type = 'integer'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN rating TYPE DOUBLE PRECISION', t);
    END IF;
  END LOOP;
END
$$;
