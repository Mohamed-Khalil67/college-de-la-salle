-- One-time setup of the local development database (PostgreSQL 18).
-- Run it as the `postgres` superuser, in pgAdmin's Query Tool or with
--   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f apps/api/prisma/setup-database.sql
-- Replace CHANGE_ME with a password of your choice first, and use the same one in apps/api/.env.

-- The app's own login: never a superuser (the same rule as `cdls_app` in Docker, deploy/db-init/10-app-role.sql).
-- CREATEDB lets `prisma migrate dev` create its temporary shadow database; production's login has no CREATEDB.
CREATE ROLE cdls WITH LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOCREATEROLE CREATEDB;

-- The database, owned by that role (so it owns the `public` schema the migrations write to).
CREATE DATABASE cdls_dev OWNER cdls ENCODING 'UTF8' TEMPLATE template0;
