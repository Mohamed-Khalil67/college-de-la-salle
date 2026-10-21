-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'disabled', 'archived');

-- CreateEnum
CREATE TYPE "section_change_status" AS ENUM ('pending', 'approved', 'rejected');

-- DropIndex
DROP INDEX "enrollments_student_id_school_year_id_key";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "graduated_on" DATE,
ADD COLUMN     "section_id" UUID;

-- AlterTable: users.is_active becomes users.status (backfilled). Existing accounts keep their password
-- (must_change_password false); accounts created from now on default to true.
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'active';
UPDATE "users" SET "status" = 'disabled' WHERE NOT "is_active";
ALTER TABLE "users" ALTER COLUMN "must_change_password" SET DEFAULT true;
ALTER TABLE "users" DROP COLUMN "is_active";

-- CreateTable
CREATE TABLE "section_change_requests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_section_id" UUID NOT NULL,
    "to_section_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "section_change_status" NOT NULL DEFAULT 'pending',
    "requested_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(1000) NOT NULL DEFAULT '',
    "new_class_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "section_change_requests_sections_differ" CHECK ("from_section_id" <> "to_section_id")
);

-- CreateIndex
CREATE INDEX "section_change_requests_student_id_created_at_idx" ON "section_change_requests"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "section_change_requests_status_created_at_idx" ON "section_change_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "section_change_requests_from_section_id_idx" ON "section_change_requests"("from_section_id");

-- CreateIndex
CREATE INDEX "section_change_requests_to_section_id_idx" ON "section_change_requests"("to_section_id");

-- CreateIndex
CREATE INDEX "section_change_requests_requested_by_id_idx" ON "section_change_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "section_change_requests_decided_by_id_idx" ON "section_change_requests"("decided_by_id");

-- CreateIndex
CREATE INDEX "section_change_requests_new_class_id_idx" ON "section_change_requests"("new_class_id");

-- CreateIndex
CREATE UNIQUE INDEX "section_change_requests_one_pending_key" ON "section_change_requests"("student_id") WHERE (status = 'pending');

-- CreateIndex
CREATE INDEX "enrollments_student_id_school_year_id_idx" ON "enrollments"("student_id", "school_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_open_student_year_key" ON "enrollments"("student_id", "school_year_id") WHERE (left_on IS NULL);

-- CreateIndex
CREATE INDEX "students_section_id_idx" ON "students"("section_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_change_requests" ADD CONSTRAINT "section_change_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_change_requests" ADD CONSTRAINT "section_change_requests_from_section_id_fkey" FOREIGN KEY ("from_section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_change_requests" ADD CONSTRAINT "section_change_requests_to_section_id_fkey" FOREIGN KEY ("to_section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_change_requests" ADD CONSTRAINT "section_change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_change_requests" ADD CONSTRAINT "section_change_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_change_requests" ADD CONSTRAINT "section_change_requests_new_class_id_fkey" FOREIGN KEY ("new_class_id") REFERENCES "school_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: each student's section is the section of their current class (open enrolment in the current
-- school year), else of their most recent enrolment. Students never enrolled keep a null section.
UPDATE "students" s
SET "section_id" = (
  SELECT c."section_id"
  FROM "enrollments" e
  JOIN "school_classes" c ON c."id" = e."class_id"
  JOIN "school_years" y ON y."id" = e."school_year_id"
  WHERE e."student_id" = s."id"
  ORDER BY (e."left_on" IS NULL AND y."is_current") DESC, y."starts_on" DESC, e."enrolled_on" DESC
  LIMIT 1
);
