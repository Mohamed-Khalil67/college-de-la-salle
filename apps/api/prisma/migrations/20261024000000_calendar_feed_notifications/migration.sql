-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('session_cancelled', 'session_moved', 'session_room_changed', 'session_restored', 'event_cancelled', 'event_moved', 'event_room_changed', 'grade_published', 'homework_assigned');

-- CreateEnum
CREATE TYPE "notification_mail_state" AS ENUM ('none', 'pending', 'sent', 'skipped');

-- AlterTable
ALTER TABLE "calendar_days" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "slot_exceptions" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_by_email" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "calendar_feeds" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_hash" VARCHAR(64) NOT NULL,
    "password_version" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(600) NOT NULL,
    "link" VARCHAR(200),
    "occurs_on" DATE,
    "entity" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "mail_state" "notification_mail_state" NOT NULL DEFAULT 'none',
    "mailed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feeds_user_id_key" ON "calendar_feeds"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_unread_idx" ON "notifications"("user_id") WHERE (read_at IS NULL);

-- CreateIndex
CREATE INDEX "notifications_mail_pending_idx" ON "notifications"("created_at") WHERE (mail_state = 'pending');

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing rows: their last change is their creation.
UPDATE "slot_exceptions" SET "updated_at" = "created_at";
UPDATE "calendar_days" SET "updated_at" = "created_at";

-- Constraints Prisma cannot express.
-- The secret is never stored: only its HMAC-SHA256, in hexadecimal.
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_secret_hash_check"
  CHECK ("secret_hash" ~ '^[0-9a-f]{64}$');
-- `mailed_at` is set exactly when the digest went out.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_mailed_check"
  CHECK (("mail_state" = 'sent') = ("mailed_at" IS NOT NULL));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_read_after_created_check"
  CHECK ("read_at" IS NULL OR "read_at" >= "created_at");
