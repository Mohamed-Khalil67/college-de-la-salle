-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "mail_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mail_next_at" TIMESTAMPTZ(3),
ADD COLUMN     "mail_seed" VARCHAR(64),
ADD COLUMN     "mailed_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "password_reset_tokens_mail_due_idx" ON "password_reset_tokens"("mail_next_at") WHERE (mail_seed IS NOT NULL);

-- The outbox of the link mail: a seed and a next try go together; a mailed link (mailed_at) holds neither.
ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_outbox_check"
  CHECK (
    (mail_seed IS NULL) = (mail_next_at IS NULL)
    AND (mailed_at IS NULL OR mail_seed IS NULL)
  );

