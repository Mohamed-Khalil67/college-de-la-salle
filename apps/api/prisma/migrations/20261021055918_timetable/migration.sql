-- CreateEnum
CREATE TYPE "week_parity" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "slot_exception_kind" AS ENUM ('cancelled', 'moved', 'substitute', 'room_change');

-- CreateEnum
CREATE TYPE "occupancy_source" AS ENUM ('slot', 'exception', 'event');

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "group_id" UUID,
    "division" VARCHAR(40),
    "teacher_id" UUID NOT NULL,
    "room_id" UUID,
    "activity_type_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "week_parity" "week_parity",
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_exceptions" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "slot_exception_kind" NOT NULL,
    "new_date" DATE,
    "new_start" VARCHAR(5),
    "new_end" VARCHAR(5),
    "new_room_id" UUID,
    "new_teacher_id" UUID,
    "reason" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy" (
    "id" UUID NOT NULL,
    "source" "occupancy_source" NOT NULL,
    "slot_id" UUID,
    "exception_id" UUID,
    "event_id" UUID,
    "day" DATE NOT NULL,
    "room_id" UUID,
    "teacher_id" UUID,
    "class_id" UUID,
    "division_key" VARCHAR(40),
    "during" tsrange NOT NULL,

    CONSTRAINT "occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_slots_class_subject_id_valid_from_idx" ON "timetable_slots"("class_subject_id", "valid_from");

-- CreateIndex
CREATE INDEX "timetable_slots_teacher_id_valid_from_idx" ON "timetable_slots"("teacher_id", "valid_from");

-- CreateIndex
CREATE INDEX "timetable_slots_room_id_valid_from_idx" ON "timetable_slots"("room_id", "valid_from");

-- CreateIndex
CREATE INDEX "timetable_slots_activity_type_id_idx" ON "timetable_slots"("activity_type_id");

-- CreateIndex
CREATE INDEX "timetable_slots_valid_from_valid_to_idx" ON "timetable_slots"("valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "slot_exceptions_date_idx" ON "slot_exceptions"("date");

-- CreateIndex
CREATE INDEX "slot_exceptions_new_room_id_idx" ON "slot_exceptions"("new_room_id");

-- CreateIndex
CREATE INDEX "slot_exceptions_new_teacher_id_idx" ON "slot_exceptions"("new_teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "slot_exceptions_slot_id_date_key" ON "slot_exceptions"("slot_id", "date");

-- CreateIndex
CREATE INDEX "occupancy_slot_id_idx" ON "occupancy"("slot_id");

-- CreateIndex
CREATE INDEX "occupancy_exception_id_idx" ON "occupancy"("exception_id");

-- CreateIndex
CREATE INDEX "occupancy_event_id_idx" ON "occupancy"("event_id");

-- CreateIndex
CREATE INDEX "occupancy_day_idx" ON "occupancy"("day");

-- CreateIndex
CREATE INDEX "occupancy_room_id_idx" ON "occupancy"("room_id");

-- CreateIndex
CREATE INDEX "occupancy_teacher_id_idx" ON "occupancy"("teacher_id");

-- CreateIndex
CREATE INDEX "occupancy_class_id_idx" ON "occupancy"("class_id");

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_exceptions" ADD CONSTRAINT "slot_exceptions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_exceptions" ADD CONSTRAINT "slot_exceptions_new_room_id_fkey" FOREIGN KEY ("new_room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_exceptions" ADD CONSTRAINT "slot_exceptions_new_teacher_id_fkey" FOREIGN KEY ("new_teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "slot_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------
-- Rules the database keeps by itself (Prisma can't express them)
-- ---------------------------------------------------------------------------------------------------

-- A slot: Sunday (0) to Saturday (6), HH:MM times, a start before the end, a valid range that is not empty.
ALTER TABLE "timetable_slots"
  ADD CONSTRAINT "timetable_slots_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "timetable_slots_times_check" CHECK (
    "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "end_time" > "start_time"
  ),
  ADD CONSTRAINT "timetable_slots_valid_check" CHECK ("valid_to" >= "valid_from");

-- An exception carries exactly what its kind needs.
ALTER TABLE "slot_exceptions"
  ADD CONSTRAINT "slot_exceptions_times_check" CHECK (
    ("new_start" IS NULL) = ("new_end" IS NULL)
    AND ("new_start" IS NULL OR (
      "new_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "new_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "new_end" > "new_start"
    ))
  ),
  ADD CONSTRAINT "slot_exceptions_kind_check" CHECK (
    CASE "kind"
      WHEN 'cancelled' THEN "new_date" IS NULL AND "new_start" IS NULL AND "new_room_id" IS NULL AND "new_teacher_id" IS NULL
      WHEN 'moved' THEN "new_teacher_id" IS NULL AND ("new_date" IS NOT NULL OR "new_start" IS NOT NULL)
      WHEN 'substitute' THEN "new_teacher_id" IS NOT NULL AND "new_date" IS NULL AND "new_start" IS NULL AND "new_room_id" IS NULL
      WHEN 'room_change' THEN "new_room_id" IS NOT NULL AND "new_date" IS NULL AND "new_start" IS NULL AND "new_teacher_id" IS NULL
    END
  );

-- Occupancy: a row holds at least one thing, and exactly one of slot / event as its origin.
ALTER TABLE "occupancy"
  ADD CONSTRAINT "occupancy_holds_check" CHECK ("room_id" IS NOT NULL OR "teacher_id" IS NOT NULL OR "class_id" IS NOT NULL),
  ADD CONSTRAINT "occupancy_origin_check" CHECK (
    CASE "source"
      WHEN 'slot' THEN "slot_id" IS NOT NULL AND "exception_id" IS NULL AND "event_id" IS NULL
      WHEN 'exception' THEN "slot_id" IS NOT NULL AND "exception_id" IS NOT NULL AND "event_id" IS NULL
      WHEN 'event' THEN "event_id" IS NOT NULL AND "slot_id" IS NULL AND "exception_id" IS NULL
    END
  ),
  ADD CONSTRAINT "occupancy_during_check" CHECK (NOT isempty("during") AND lower("during") IS NOT NULL AND upper("during") IS NOT NULL);

-- Double bookings are impossible, even when two people save at the same moment: exclusion constraints
-- (btree_gist, a trusted extension the database owner can create) on the occupancy index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_room_no_overlap" EXCLUDE USING gist (
  "room_id" WITH =,
  "during" WITH &&
) WHERE ("room_id" IS NOT NULL);

ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_teacher_no_overlap" EXCLUDE USING gist (
  "teacher_id" WITH =,
  "during" WITH &&
) WHERE ("teacher_id" IS NOT NULL);

-- A class holds one thing at a time, except groups of the same non-null division, which run in parallel:
-- two rows of the whole class never overlap; a row of a division never overlaps a row of another division
-- or of the whole class (the whole class counts as division '').
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_class_whole_no_overlap" EXCLUDE USING gist (
  "class_id" WITH =,
  "during" WITH &&
) WHERE ("class_id" IS NOT NULL AND "division_key" IS NULL);

ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_class_division_no_overlap" EXCLUDE USING gist (
  "class_id" WITH =,
  (COALESCE("division_key", '')) WITH <>,
  "during" WITH &&
) WHERE ("class_id" IS NOT NULL);
