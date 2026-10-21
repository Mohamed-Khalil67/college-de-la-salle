-- Phase 1: activity types replace the `event_kind` enum. One system type per old enum value, with the same
-- flags as EVENT_KINDS had (now SYSTEM_ACTIVITY_TYPES in packages/shared); every event is mapped to the
-- type of its kind, then the enum is dropped.

CREATE TABLE "activity_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "colour" VARCHAR(20) NOT NULL,
    "icon" VARCHAR(20) NOT NULL,
    "gradable" BOOLEAN NOT NULL DEFAULT false,
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "homework" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "owner_teacher_id" UUID,
    "sort_order" SMALLINT NOT NULL DEFAULT 100,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id"),
    -- System types are school-wide.
    CONSTRAINT "activity_types_system_check" CHECK (NOT "is_system" OR "owner_teacher_id" IS NULL)
);

CREATE UNIQUE INDEX "activity_types_code_key" ON "activity_types"("code");
CREATE INDEX "activity_types_owner_teacher_id_idx" ON "activity_types"("owner_teacher_id");
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_owner_teacher_id_fkey" FOREIGN KEY ("owner_teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The system types: code (the old enum value), label, colour token, icon, flags.
INSERT INTO "activity_types" ("id", "code", "label", "colour", "icon", "repeatable", "gradable", "homework", "is_system", "sort_order") VALUES
  (uuidv7(), 'cours',    'Cours',           'navy',  'book',      true,  false, false, true, 1),
  (uuidv7(), 'td',       'TD',              'green', 'users',     true,  false, false, true, 2),
  (uuidv7(), 'tp',       'TP',              'green', 'eye',       true,  true,  false, true, 3),
  (uuidv7(), 'examen',   'Examen',          'red',   'file-text', false, true,  false, true, 4),
  (uuidv7(), 'controle', 'Contrôle',        'gold',  'check',     false, true,  false, true, 5),
  (uuidv7(), 'devoir',   'Devoir à rendre', 'brick', 'edit',      false, true,  true,  true, 6),
  (uuidv7(), 'revision', 'Révision',        'stone', 'clock',     true,  false, false, true, 7),
  (uuidv7(), 'activite', 'Activité',        'green', 'map-pin',   true,  false, false, true, 8),
  (uuidv7(), 'reunion',  'Réunion',         'stone', 'users',     false, false, false, true, 9);

-- Map every event to the type of its kind.
ALTER TABLE "events" ADD COLUMN "activity_type_id" UUID;

UPDATE "events" AS e
SET "activity_type_id" = t."id"
FROM "activity_types" AS t
WHERE t."code" = e."kind"::text;

ALTER TABLE "events" ALTER COLUMN "activity_type_id" SET NOT NULL;

DROP INDEX "events_kind_date_idx";
ALTER TABLE "events" DROP COLUMN "kind";
DROP TYPE "event_kind";

CREATE INDEX "events_activity_type_id_date_idx" ON "events"("activity_type_id", "date");
ALTER TABLE "events" ADD CONSTRAINT "events_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
