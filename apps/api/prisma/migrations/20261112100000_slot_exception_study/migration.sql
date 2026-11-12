-- « Professeur absent »: a lesson may become a supervised study (`study`), and the students and teachers
-- are told when a lesson is covered by another teacher or becomes a study.

ALTER TYPE "slot_exception_kind" ADD VALUE IF NOT EXISTS 'study';
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'session_substituted';
ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'session_study';

-- The CHECK is rewritten for the new kind. It compares the kind as text: a value added to an enum cannot be
-- used by name in the transaction that adds it.
ALTER TABLE "slot_exceptions" DROP CONSTRAINT "slot_exceptions_kind_check";
ALTER TABLE "slot_exceptions"
  ADD CONSTRAINT "slot_exceptions_kind_check" CHECK (
    CASE "kind"::text
      WHEN 'cancelled' THEN "new_date" IS NULL AND "new_start" IS NULL AND "new_room_id" IS NULL AND "new_teacher_id" IS NULL
      WHEN 'moved' THEN "new_teacher_id" IS NULL AND ("new_date" IS NOT NULL OR "new_start" IS NOT NULL)
      WHEN 'substitute' THEN "new_teacher_id" IS NOT NULL AND "new_date" IS NULL AND "new_start" IS NULL AND "new_room_id" IS NULL
      WHEN 'room_change' THEN "new_room_id" IS NOT NULL AND "new_date" IS NULL AND "new_start" IS NULL AND "new_teacher_id" IS NULL
      -- Supervised study: the supervisor is required, the room is optional (the lesson's own room otherwise).
      WHEN 'study' THEN "new_teacher_id" IS NOT NULL AND "new_date" IS NULL AND "new_start" IS NULL
    END
  );
