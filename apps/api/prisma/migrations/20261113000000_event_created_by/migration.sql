-- « Ajouter un examen » for a planner or an admin without a teacher profile: such an account owns no
-- Teacher row, so an event can now be authored by an account instead of a teacher.

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "author_id" DROP NOT NULL;
ALTER TABLE "events" ADD COLUMN "created_by_id" UUID;

-- CreateIndex
CREATE INDEX "events_created_by_id_idx" ON "events"("created_by_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An event always has an owner: a teacher (every event so far) or the account that created it (Prisma cannot express a CHECK).
ALTER TABLE "events" ADD CONSTRAINT "events_has_author" CHECK ("author_id" IS NOT NULL OR "created_by_id" IS NOT NULL);
