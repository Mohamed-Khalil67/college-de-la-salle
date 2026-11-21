-- The API's own database login, `cdls_app`: NOT a superuser (no COPY ... TO PROGRAM, no reading server files, no
-- other databases' roles), owner of the `cdls` database and of everything in its `public` schema, which is what
-- `prisma migrate deploy` needs (CREATE/ALTER/DROP of its own tables, and CREATE EXTENSION btree_gist, a trusted
-- extension a database owner may create). The superuser `cdls` (POSTGRES_USER) stays for the image itself, the
-- backup container and the commands of deploy/restore.md.
--
-- Run automatically by the postgres image on a NEW data volume (/docker-entrypoint-initdb.d). On an install that
-- already has data, run it once by hand (docs/deployment.md, "Database login of the API"); it is idempotent:
--   docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db \
--     psql -v ON_ERROR_STOP=1 -U cdls -d cdls -f /docker-entrypoint-initdb.d/10-app-role.sql
-- The password comes from APP_DB_PASSWORD in the db container's environment, never from this file.
\set ON_ERROR_STOP on
\getenv app_password APP_DB_PASSWORD
\if :{?app_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APP_DB_PASSWORD is not set in the db container: add it to deploy/.env.'; END $$;
\endif

SELECT format('CREATE ROLE cdls_app LOGIN PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cdls_app') \gexec
-- Re-applied every run: the attributes are what make the role least-privileged, and the password follows the .env.
SELECT format('ALTER ROLE cdls_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
              :'app_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO cdls_app', current_database()) \gexec
ALTER SCHEMA public OWNER TO cdls_app;

-- An install that ran as the superuser until now: hand its tables, views, sequences, types and functions over, so
-- the next migration may alter them. Objects that belong to an extension (btree_gist) and sequences owned by a
-- column stay as they are (they follow their extension or table).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS name,
           CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE'
                          WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END AS kind
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
       AND c.relowner <> 'cdls_app'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                          AND d.deptype IN ('e', 'a', 'i'))
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO cdls_app', r.kind, r.name);
  END LOOP;
  FOR r IN
    SELECT t.oid::regtype AS name
      FROM pg_type t
     WHERE t.typnamespace = 'public'::regnamespace
       AND t.typtype IN ('e', 'd', 'c')
       AND t.typowner <> 'cdls_app'::regrole
       AND (t.typtype <> 'c' OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO cdls_app', r.name);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS name, CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proowner <> 'cdls_app'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO cdls_app', r.kind, r.name);
  END LOOP;
END $$;
