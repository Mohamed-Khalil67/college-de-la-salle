-- « Appel fait » on the teacher's home page reads the roll calls a teacher saved today: filter on the
-- recorder and the day. The composite index also serves the foreign key (its first column), so the single-column one goes.
DROP INDEX "attendance_recorded_by_id_idx";
CREATE INDEX "attendance_recorded_by_id_date_idx" ON "attendance"("recorded_by_id", "date");
