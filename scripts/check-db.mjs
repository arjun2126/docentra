// Start the database and prove both isolated databases exist.
// Fails loudly rather than skipping: a missing database is not a passed check.
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://docentra:docentra@localhost:55432/docentra_dev';
const EXPECTED = ['docentra_dev', 'docentra_test'];

console.log('starting postgres:16 via docker compose...');
execFileSync('docker', ['compose', 'up', '-d'], { stdio: 'inherit' });

const deadline = Date.now() + 90_000;
let lastError = null;

while (Date.now() < deadline) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      "select datname from pg_database where datname = any($1::text[]) order by datname",
      [EXPECTED],
    );
    await client.end();
    const names = rows.map((row) => row.datname);
    if (names.length === EXPECTED.length) {
      console.log(`databases ready: ${names.join(', ')}`);
      process.exit(0);
    }
    lastError = new Error(`expected ${EXPECTED.join(', ')}, found ${names.join(', ') || 'none'}`);
  } catch (error) {
    lastError = error;
    if (client) await client.end().catch(() => {});
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.error(`db:check failed: ${lastError?.message ?? 'timed out'}`);
process.exit(1);
