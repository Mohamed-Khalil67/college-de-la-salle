-- Phase 1: terms become periods (trimester or semester, for every section or one), gradable events store
-- their period, and report cards point to a period. Periods of the same year, section and kind never
-- overlap (EXCLUDE with btree_gist).

-- Pre-flight: the constraints below cannot hold for terms that overlap or end before they start (the old
-- code never checked). Stop with the list, so they can be corrected first (nothing has been changed yet).
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT format('%s / %s', a.label, b.label), ', ')
    INTO bad
    FROM terms a
    JOIN terms b ON a.school_year_id = b.school_year_id AND a.id < b.id
                AND a.starts_on <= b.ends_on AND b.starts_on <= a.ends_on;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Trimestres qui se chevauchent : %. Corrigez leurs dates avant de migrer.', bad;
  END IF;
  SELECT string_agg(label, ', ') INTO bad FROM terms WHERE ends_on < starts_on;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Trimestres qui finissent avant de commencer : %. Corrigez leurs dates avant de migrer.', bad;
  END IF;
END $$;

-- btree_gist is a trusted extension: the database owner can create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "period_kind" AS ENUM ('trimester', 'semester');

-- terms → periods (same rows, same ids) -----------------------------------------------------------------
ALTER TABLE "terms" RENAME TO "periods";
ALTER TABLE "periods" RENAME CONSTRAINT "terms_pkey" TO "periods_pkey";
ALTER TABLE "periods" RENAME CONSTRAINT "terms_school_year_id_fkey" TO "periods_school_year_id_fkey";
ALTER INDEX "terms_starts_on_ends_on_idx" RENAME TO "periods_starts_on_ends_on_idx";
-- Replaced by periods_number_unique below (which also counts a null section as a value).
DROP INDEX "terms_school_year_id_number_key";

-- Every existing term was a trimester of every section.
ALTER TABLE "periods" ADD COLUMN "kind" "period_kind" NOT NULL DEFAULT 'trimester',
ADD COLUMN "section_id" UUID;

CREATE INDEX "periods_school_year_id_kind_idx" ON "periods"("school_year_id", "kind");
CREATE INDEX "periods_section_id_idx" ON "periods"("section_id");
ALTER TABLE "periods" ADD CONSTRAINT "periods_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "periods" ADD CONSTRAINT "periods_dates_check" CHECK ("ends_on" >= "starts_on");

-- No two periods of the same year, section (null = every section) and kind overlap, and their numbers
-- are unique. Exclusion constraints hold even when two people save at the same moment.
ALTER TABLE "periods" ADD CONSTRAINT "periods_no_overlap" EXCLUDE USING gist (
  "school_year_id" WITH =,
  (COALESCE("section_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  "kind" WITH =,
  daterange("starts_on", "ends_on", '[]') WITH &&
);
ALTER TABLE "periods" ADD CONSTRAINT "periods_number_unique" EXCLUDE USING gist (
  "school_year_id" WITH =,
  (COALESCE("section_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  "kind" WITH =,
  "number" WITH =
);

-- Report cards ------------------------------------------------------------------------------------------
ALTER TABLE "report_cards" DROP CONSTRAINT "report_cards_term_id_fkey";
ALTER TABLE "report_cards" RENAME COLUMN "term_id" TO "period_id";
ALTER INDEX "report_cards_student_id_term_id_key" RENAME TO "report_cards_student_id_period_id_key";
ALTER INDEX "report_cards_term_id_class_id_idx" RENAME TO "report_cards_period_id_class_id_idx";
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gradable events store their period -----------------------------------------------------------------------
ALTER TABLE "events" ADD COLUMN "period_id" UUID;
CREATE INDEX "events_period_id_idx" ON "events"("period_id");
ALTER TABLE "events" ADD CONSTRAINT "events_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from the date, exactly as report cards found a term until now: the period of the class's
-- school year whose dates contain the event's day. From now on grades follow period_id, so editing a
-- period's dates never moves them.
UPDATE "events" AS e
SET "period_id" = p."id"
FROM "activity_types" AS t, "school_classes" AS c, "periods" AS p
WHERE t."id" = e."activity_type_id"
  AND t."gradable"
  AND c."id" = e."class_id"
  AND p."school_year_id" = c."school_year_id"
  AND e."date" BETWEEN p."starts_on" AND p."ends_on";
