-- « Relancer » (admin page, « Préparer les bulletins »): the admin reminds teachers who still have grades to
-- finish. The reminder is a notification of a new kind, written by NotificationsService like the others.
ALTER TYPE "notification_kind" ADD VALUE 'grades_reminder';

-- The admin page counts the Planificateurs and the accounts still on their temporary password: both are
-- small sets, so partial indexes keep those filters cheap.
CREATE INDEX "users_planner_idx" ON "users" ("last_name", "first_name") WHERE is_planner;
CREATE INDEX "users_temp_password_idx" ON "users" ("last_name", "first_name") WHERE must_change_password;
