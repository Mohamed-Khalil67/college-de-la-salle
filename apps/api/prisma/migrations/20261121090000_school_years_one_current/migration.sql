-- At most one school year is current. makeCurrent and the rollover clear the old current year before they set the
-- new one, but two admins making two different years current at the same moment each locked only their own row,
-- so both ended up current (audit 2026-11-21, finding 10). The partial unique index makes the second commit fail;
-- the API answers it with a French 409.

-- Stop with a clear message rather than a bare unique violation if an install already has two current years.
DO $$
BEGIN
  IF (SELECT count(*) FROM "school_years" WHERE "is_current") > 1 THEN
    RAISE EXCEPTION 'Several school years are current (%): make exactly one current before migrating.',
      (SELECT string_agg("label", ', ' ORDER BY "label") FROM "school_years" WHERE "is_current");
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "school_years_one_current_key" ON "school_years"("is_current") WHERE (is_current);
