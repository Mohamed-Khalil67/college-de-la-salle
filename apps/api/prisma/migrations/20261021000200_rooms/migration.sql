-- Phase 1: rooms, and an optional room on events (`place` stays free text for places outside the school).
-- Clashes are not checked yet: phase 2 adds an occupancy table with exclusion constraints on room_id.

CREATE TYPE "room_kind" AS ENUM ('classroom', 'lab', 'gym', 'hall');

CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "capacity" SMALLINT,
    "kind" "room_kind" NOT NULL DEFAULT 'classroom',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rooms_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0)
);

CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

ALTER TABLE "events" ADD COLUMN "room_id" UUID;
CREATE INDEX "events_room_id_date_idx" ON "events"("room_id", "date");
ALTER TABLE "events" ADD CONSTRAINT "events_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
