-- Phase 1: calendar days (holidays, exam weeks, days without classes, special days) per school year, for
-- the whole school, a section or some classes. Holidays and « pas de cours » days cancel weekly sessions.

CREATE TYPE "calendar_day_type" AS ENUM ('holiday', 'exam_week', 'no_classes', 'event_day');

CREATE TABLE "calendar_days" (
    "id" UUID NOT NULL,
    "school_year_id" UUID NOT NULL,
    "type" "calendar_day_type" NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "section_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_days_dates_check" CHECK ("ends_on" >= "starts_on")
);

CREATE TABLE "calendar_day_classes" (
    "calendar_day_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,

    CONSTRAINT "calendar_day_classes_pkey" PRIMARY KEY ("calendar_day_id","class_id")
);

CREATE INDEX "calendar_days_school_year_id_starts_on_idx" ON "calendar_days"("school_year_id", "starts_on");
CREATE INDEX "calendar_days_starts_on_ends_on_idx" ON "calendar_days"("starts_on", "ends_on");
CREATE INDEX "calendar_days_section_id_idx" ON "calendar_days"("section_id");
CREATE INDEX "calendar_day_classes_class_id_idx" ON "calendar_day_classes"("class_id");

ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_day_classes" ADD CONSTRAINT "calendar_day_classes_calendar_day_id_fkey" FOREIGN KEY ("calendar_day_id") REFERENCES "calendar_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_day_classes" ADD CONSTRAINT "calendar_day_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
