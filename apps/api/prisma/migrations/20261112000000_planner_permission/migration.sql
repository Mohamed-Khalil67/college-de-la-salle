-- Planificateur (docs/workflow-redesign.md, step 1): the coordinator flag of a teacher becomes a permission
-- on the account, so that a non-teaching staff account can hold it too.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_planner" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every coordinator teacher is a planner. Student accounts are left out so that the CHECK below
-- cannot fail on old data (a teacher row belongs to a teacher account, but the database never enforced it).
UPDATE "users" AS u
SET "is_planner" = true
FROM "teachers" AS t
WHERE t."user_id" = u."id" AND t."is_coordinator" AND u."role" <> 'student';

-- A student is never a planner (Prisma cannot express a CHECK).
ALTER TABLE "users" ADD CONSTRAINT "users_planner_not_student" CHECK (NOT ("is_planner" AND "role" = 'student'));

-- No index on is_planner: it is read with the user row (by primary key) on every request, never filtered on.

-- The code reads users.is_planner from this change on.
ALTER TABLE "teachers" DROP COLUMN "is_coordinator";
