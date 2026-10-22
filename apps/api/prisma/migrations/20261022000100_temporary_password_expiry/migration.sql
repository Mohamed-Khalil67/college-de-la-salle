-- Temporary passwords expire: the instant is set when the administration creates, imports or resets an
-- account (TEMP_PASSWORD_TTL_DAYS later). Null means no expiry.
ALTER TABLE "users" ADD COLUMN "temporary_password_expires_at" TIMESTAMPTZ(3);

-- Accounts that still wait for their first sign-in get the default 14 days from now.
UPDATE "users" SET "temporary_password_expires_at" = now() + interval '14 days'
WHERE "must_change_password";
