-- Phase 5 (next year): an archived school year is read-only, and a class points at the class of the next level.

-- AlterTable
ALTER TABLE "school_years" ADD COLUMN "archived_at" TIMESTAMPTZ(3);

-- An archived year is never the current one.
ALTER TABLE "school_years"
  ADD CONSTRAINT "school_years_archived_not_current" CHECK (NOT ("is_current" AND "archived_at" IS NOT NULL));

-- AlterTable
ALTER TABLE "school_classes" ADD COLUMN "next_class_id" UUID;

-- CreateIndex
CREATE INDEX "school_classes_next_class_id_idx" ON "school_classes"("next_class_id");

-- AddForeignKey
ALTER TABLE "school_classes"
  ADD CONSTRAINT "school_classes_next_class_id_fkey" FOREIGN KEY ("next_class_id") REFERENCES "school_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the levels of CLASSES in packages/shared (section.code, class code → next class code), same year and section.
UPDATE "school_classes" c
SET "next_class_id" = n."id"
FROM "sections" s, "school_classes" n,
  (VALUES
    ('nationale', 'secondaire-1', 'secondaire-2'),
    ('nationale', 'secondaire-2', 'secondaire-3'),
    ('bac', 'seconde', 'premiere'),
    ('bac', 'premiere', 'terminale')
  ) AS chain(section_code, code, next_code)
WHERE s."id" = c."section_id"
  AND s."code" = chain.section_code
  AND c."code" = chain.code
  AND n."school_year_id" = c."school_year_id"
  AND n."section_id" = c."section_id"
  AND n."code" = chain.next_code;
