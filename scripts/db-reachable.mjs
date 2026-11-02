// Exit 0 when the integration database answers, 1 otherwise.
// Gates use this to skip integration honestly instead of pretending it ran.
import pg from 'pg';

const url =
  process.env.TEST_DATABASE_URL ??
  'postgresql://docentra:docentra@127.0.0.1:56000/docentra_test';

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
try {
  await client.connect();
  await client.query('select 1');
  await client.end();
  process.exit(0);
} catch (err) {
  process.stderr.write(`database not reachable: ${err.message}\n`);
  process.exit(1);
}
