-- CreateEnum
CREATE TYPE "target_scope" AS ENUM ('class', 'group', 'student');

-- AlterTable
ALTER TABLE "occupancy" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "division" VARCHAR(40) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "division" VARCHAR(40) NOT NULL,
    "joined_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_on" DATE,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_targets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "scope" "target_scope" NOT NULL,
    "group_id" UUID,
    "student_id" UUID,

    CONSTRAINT "assessment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_class_id_division_label_key" ON "groups"("class_id", "division", "label");

-- CreateIndex
CREATE INDEX "group_members_group_id_left_on_idx" ON "group_members"("group_id", "left_on");

-- CreateIndex
CREATE INDEX "group_members_student_id_left_on_idx" ON "group_members"("student_id", "left_on");

-- CreateIndex
CREATE INDEX "group_members_class_id_idx" ON "group_members"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_open_student_division_key" ON "group_members"("student_id", "class_id", "division") WHERE (left_on IS NULL);

-- CreateIndex
CREATE INDEX "assessment_targets_group_id_idx" ON "assessment_targets"("group_id");

-- CreateIndex
CREATE INDEX "assessment_targets_student_id_idx" ON "assessment_targets"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_targets_event_id_group_id_key" ON "assessment_targets"("event_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_targets_event_id_student_id_key" ON "assessment_targets"("event_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_targets_one_class_key" ON "assessment_targets"("event_id") WHERE (scope = 'class');

-- CreateIndex
CREATE INDEX "occupancy_group_id_idx" ON "occupancy"("group_id");

-- CreateIndex
CREATE INDEX "timetable_slots_group_id_idx" ON "timetable_slots"("group_id");

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_targets" ADD CONSTRAINT "assessment_targets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_targets" ADD CONSTRAINT "assessment_targets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_targets" ADD CONSTRAINT "assessment_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------
-- Rules Prisma cannot express
-- ---------------------------------------------------------------------------------------------------

-- A target row is consistent with its scope: `class` names nobody, `group` a group, `student` a student.
ALTER TABLE "assessment_targets" ADD CONSTRAINT "assessment_targets_scope_check" CHECK (
  ("scope" = 'class' AND "group_id" IS NULL AND "student_id" IS NULL)
  OR ("scope" = 'group' AND "group_id" IS NOT NULL AND "student_id" IS NULL)
  OR ("scope" = 'student' AND "student_id" IS NOT NULL AND "group_id" IS NULL)
);

-- A membership never ends before it starts.
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_dates_check" CHECK ("left_on" IS NULL OR "left_on" >= "joined_on");

-- The same group is never in two places at once: two index rows of one group never overlap. (Groups of the
-- same division still share the class; the class constraints above are unchanged.)
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_group_no_overlap" EXCLUDE USING gist (
  "group_id" WITH =,
  "during" WITH &&
) WHERE ("group_id" IS NOT NULL);

-- ---------------------------------------------------------------------------------------------------
-- Backfill: every existing assessment and homework of a class is addressed to the whole class, which is
-- what the grade sheets, the attendance sheets and the students' lists already did. Nothing visible changes.
-- (No row at all also means the whole class, so events created by older code behave the same.)
-- ---------------------------------------------------------------------------------------------------
INSERT INTO "assessment_targets" ("id", "event_id", "scope")
SELECT gen_random_uuid(), e."id", 'class'::"target_scope"
  FROM "events" e
  JOIN "activity_types" t ON t."id" = e."activity_type_id"
 WHERE e."class_id" IS NOT NULL AND (t."gradable" OR t."homework");
