-- RefListItem gets a unique (listId, externalId) (spec 4.8). Runs on every
-- container start BEFORE `prisma db push`. When the table already exists
-- (a database that had it before the constraint), drop duplicate rows (keeping
-- the lowest position) and create the index db push expects, so db push sees
-- no change and never asks for --accept-data-loss. A fresh database (no table
-- yet) is left alone: db push creates the table with the index. Idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'RefListItem'
  ) THEN
    DELETE FROM "RefListItem" a
    USING "RefListItem" b
    WHERE a."listId" = b."listId"
      AND a."externalId" = b."externalId"
      AND (a.position > b.position OR (a.position = b.position AND a.id > b.id));
    CREATE UNIQUE INDEX IF NOT EXISTS "RefListItem_listId_externalId_key"
      ON "RefListItem" ("listId", "externalId");
  END IF;
END
$$;
