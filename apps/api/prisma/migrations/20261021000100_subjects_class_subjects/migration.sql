-- Phase 1 (docs/school-year-design.md): coordinators, the subject catalogue in the database, and the
-- subjects of each class (ClassSubject) holding the coefficient that used to sit on teaching assignments.

-- Coordinators -----------------------------------------------------------------------------------------
ALTER TABLE "teachers" ADD COLUMN "is_coordinator" BOOLEAN NOT NULL DEFAULT false;

-- Subjects: the sections they apply to, and archiving --------------------------------------------------
ALTER TABLE "subjects" ADD COLUMN "archived_at" TIMESTAMPTZ(3),
ADD COLUMN "sections" VARCHAR(20)[] DEFAULT ARRAY[]::VARCHAR(20)[];

-- Backfill from the catalogue's tracks (MATIERES in packages/shared); other subjects get both sections.
UPDATE "subjects" SET "sections" = CASE "id"
    WHEN 'espagnol' THEN ARRAY['bac']
    WHEN 'ses' THEN ARRAY['bac']
    WHEN 'humanites' THEN ARRAY['bac']
    WHEN 'psychologie' THEN ARRAY['nationale']
    WHEN 'education-religieuse' THEN ARRAY['nationale']
    ELSE ARRAY['nationale', 'bac']
  END::VARCHAR(20)[];

-- Class subjects ----------------------------------------------------------------------------------------
CREATE TABLE "class_subjects" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" VARCHAR(40) NOT NULL,
    "coefficient" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "hours_per_week" DECIMAL(4,2),

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_subjects_subject_id_idx" ON "class_subjects"("subject_id");
CREATE UNIQUE INDEX "class_subjects_class_id_subject_id_key" ON "class_subjects"("class_id", "subject_id");
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one class subject per (class, subject) taught today. Its coefficient is the highest of the
-- assignments' coefficients, which is how report cards and averages weighed a co-taught subject, so no
-- average changes.
INSERT INTO "class_subjects" ("id", "class_id", "subject_id", "coefficient")
SELECT uuidv7(), "class_id", "subject_id", MAX("coefficient")
FROM "teaching_assignments"
GROUP BY "class_id", "subject_id";

-- Teaching assignments now point to a class subject ------------------------------------------------------
ALTER TABLE "teaching_assignments" ADD COLUMN "class_subject_id" UUID;

UPDATE "teaching_assignments" AS a
SET "class_subject_id" = cs."id"
FROM "class_subjects" AS cs
WHERE cs."class_id" = a."class_id" AND cs."subject_id" = a."subject_id";

ALTER TABLE "teaching_assignments" ALTER COLUMN "class_subject_id" SET NOT NULL;

ALTER TABLE "teaching_assignments" DROP CONSTRAINT "teaching_assignments_class_id_fkey";
ALTER TABLE "teaching_assignments" DROP CONSTRAINT "teaching_assignments_subject_id_fkey";
DROP INDEX "teaching_assignments_class_id_subject_id_idx";
DROP INDEX "teaching_assignments_subject_id_idx";
DROP INDEX "teaching_assignments_teacher_id_class_id_subject_id_key";
ALTER TABLE "teaching_assignments" DROP COLUMN "class_id",
DROP COLUMN "coefficient",
DROP COLUMN "subject_id";

CREATE INDEX "teaching_assignments_class_subject_id_idx" ON "teaching_assignments"("class_subject_id");
CREATE UNIQUE INDEX "teaching_assignments_teacher_id_class_subject_id_key" ON "teaching_assignments"("teacher_id", "class_subject_id");
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
