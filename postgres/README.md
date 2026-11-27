# AYUSH PostgreSQL / Supabase add-on (non-destructive)

This folder is added alongside the original project. No existing frontend, API Gateway, backend, integration, SQLite helper, or database file is replaced. The SQLite source files are opened read-only by the migration utility.

## Important compatibility note
The application in this ZIP currently uses `better-sqlite3` synchronous calls (`db.prepare(...).get/all/run()` and `db.exec()`). PostgreSQL's `pg` driver is asynchronous and has a different SQL dialect. Therefore this add-on provides a PostgreSQL connection pool and a safe SQLite-to-PostgreSQL data-copy utility; it does **not** switch the existing application runtime to PostgreSQL. That runtime conversion requires service-by-service source changes and tests. Existing app behavior remains unchanged by this add-on.

## 1. Install PostgreSQL driver
From the project root run:

```bash
npm install pg
```

This adds the dependency to your local package manifest/lockfile. The delivered ZIP deliberately leaves your original package files untouched.

## 2. Configure Supabase
Copy `postgres/.env.postgres.example` settings into your local `.env`. In Supabase Dashboard open **Project Settings → Database → Connection string → Session pooler** and copy the exact host, username and password. Use the session pooler for an IPv4 EC2 host. Keep `sslmode=require`. Do not commit `.env` or share database passwords.

## 3. Test connection
After setting `SUPABASE_DATABASE_URL`:

```bash
node -e "require('dotenv').config(); require('./postgres/pool').healthcheck().then(console.log).finally(()=>require('./postgres/pool').close())"
```

## 4. Preview the SQLite data copy
The default source is `shared-database-template`. For your real local data, set `SQLITE_ROOT` to the exact folder containing the service `.db` files (for example your existing `AYUSH_SHARED_DATA` directory). First run preview only:

```bash
node postgres/migrate-sqlite.js
```

Nothing is written to PostgreSQL in preview mode. When the preview lists the expected databases/tables/row counts, apply the copy:

```bash
node postgres/migrate-sqlite.js --apply
```

The script creates one PostgreSQL schema per service/database, creates tables based on SQLite metadata, and copies rows. It uses `ON CONFLICT DO NOTHING` for primary-key tables so reruns do not overwrite existing PostgreSQL rows. Tables without primary keys are appended; do not rerun those unless you have checked them. It does not drop schemas/tables, truncate data, or modify SQLite files. Review the preview before applying.

## Database/schema mapping
See `schema-map.json`. Current mappings include `platform.db → shared_platform`, `clinical.db → common_clinical`, `longitudinal.db → longitudinal_record`, `event-bus.db → event_bus`, and separate AYUSH domain schemas.

## What remains before live Supabase runtime
1. Convert each service's synchronous SQLite repository calls to async PostgreSQL queries.
2. Replace SQLite-only syntax (`?`, `INSERT OR IGNORE`, `rowid`, `lastInsertRowid`, SQLite `ALTER TABLE` patterns) with PostgreSQL equivalents (`$1`, `ON CONFLICT`, explicit ordering/keys, `RETURNING`).
3. Add startup migrations for each service schema and verify constraints/indexes.
4. Run service isolation, API, auth, event delivery, upload and appointment tests against a staging Supabase project.
5. Only then enable PostgreSQL in the running app. Keep SQLite backups until parity is verified.

**No existing project files are removed or rewritten by this add-on.**
