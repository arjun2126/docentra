// Verify the seeded data is complete and internally consistent.
// Exits non-zero with a specific message instead of a generic failure.
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://docentra:docentra@localhost:55432/docentra_dev';
const EXPECTED_VENDORS = 4;
const EXPECTED_DOCUMENTS = 6;

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const problems = [];
const addProblem = (message) => problems.push(message);

try {
  const vendors = await client.query('select count(*)::int as n from docflow.vendor');
  if (vendors.rows[0].n !== EXPECTED_VENDORS) {
    addProblem(`expected ${EXPECTED_VENDORS} vendors, found ${vendors.rows[0].n}`);
  }

  const documents = await client.query('select count(*)::int as n from docflow.document_header');
  if (documents.rows[0].n !== EXPECTED_DOCUMENTS) {
    addProblem(`expected ${EXPECTED_DOCUMENTS} documents, found ${documents.rows[0].n}`);
  }

  const statuses = await client.query(
    'select status, count(*)::int as n from docflow.document_header group by status',
  );
  for (const required of ['draft', 'submitted', 'approved', 'rejected']) {
    const found = statuses.rows.find((row) => row.status === required);
    if (!found || found.n < 1) addProblem(`no document with status ${required}`);
  }

  const totals = await client.query(`
    select h.document_number,
           h.total_amount::text as total,
           coalesce(sum(d.amount), 0)::text as detail_sum,
           count(d.detail_id)::int as lines
      from docflow.document_header h
      left join docflow.document_detail d on d.shno = h.shno
     group by h.shno, h.document_number, h.total_amount
  `);
  for (const row of totals.rows) {
    if (Number(row.total) !== Number(row.detail_sum)) {
      addProblem(`${row.document_number}: total ${row.total} != sum of details ${row.detail_sum}`);
    }
    if (row.lines === 0) addProblem(`${row.document_number}: has no line items`);
  }

  const duplicates = await client.query(`
    select document_number, count(*)::int as n
      from docflow.document_header
     group by document_number
    having count(*) > 1
  `);
  for (const row of duplicates.rows) {
    addProblem(`duplicate document_number ${row.document_number}`);
  }
} finally {
  await client.end();
}

if (problems.length > 0) {
  console.error('seed verification failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `seed verified: ${EXPECTED_VENDORS} vendors, ${EXPECTED_DOCUMENTS} documents, totals consistent`,
);
