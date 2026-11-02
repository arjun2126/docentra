# Isolated browser tests

Run `npm run test:e2e`. Node 22, installed dependencies, generated Prisma client,
Chromium (`npx playwright install chromium`), and PostgreSQL 16 with CREATEDB
privilege are required. CI installs Chromium and Linux system libraries.

`DATABASE_URL` (including `.env`) is **only read** for a full before/after snapshot
of development vendors, headers and details. The runner defaults the admin
connection to the same server/credentials with database `postgres`; set
`E2E_ADMIN_DATABASE_URL` to use another admin connection. Both URLs must use
ordinary PostgreSQL connection syntax without query parameters for admin use.
Never point the protected connection at a database integration tests are resetting
concurrently. CI runs integration and E2E sequentially.

Every run creates `docentra_e2e_<prefix>_<24 random hex characters>` with CREATE
DATABASE (never IF NOT EXISTS). `E2E_DATABASE_PREFIX` optionally replaces `run`
with 1–18 lowercase letters, digits or underscores; a complete target URL/name
cannot be supplied. Old disposable databases are never reset, enumerated for
cleanup, or deleted. Cleanup needs the current creation receipt, matching database
OID and random ownership comment. It uses DROP DATABASE without FORCE, after the
app stops; identity mismatch or open connections cause failure, not termination.
A hard kill may leave this run's database behind; there is deliberately no
automatic stale-database cleanup.

Migrations and a deterministic seed (one fixed-timestamp vendor, zero documents)
are applied only to the new target. All inherited database/Next/Node overrides are
stripped from child environments. App sources are copied without `.env` to a
private temporary workspace, linked to existing dependencies and built there.
Neither development `.next` nor an existing server is reused. A random loopback
port is used; failure to bind fails the run. Playwright requires the runner's
private launch receipt and matching environment; direct invocation fails closed.
Database OID/comment and exact initial fixtures are checked before the tests.
A fresh database-to-HTTP challenge temporarily renames the seed vendor and
requires that value in the served page before allowing any browser writes; the
fixed seed name/timestamp are then restored. A wrong or reused server fails closed.
A browser-created vendor is then queried from that database, proving the actual
app target. Full development row snapshots must remain identical afterward.
No credentials or database identity endpoints are added to the product.

The printed temporary artifact directory contains the production app/build,
Playwright downloads/traces, full development snapshots and `report.json` with
target name, seed rows, preservation and cleanup results. `launch.json` contains
credentials, is mode 0600 inside a private temporary directory, and must **not**
be uploaded or committed. Artifacts are intentionally retained for inspection.
