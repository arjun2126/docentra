// Independent check of the demonstration data. Reads the database rather than
// trusting the seeder's own report, and fails loudly on any inconsistency.
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://docentra:docentra@127.0.0.1:56000/docentra_dev';

const EXPECTED_VENDORS = 6;
const EXPECTED_DOCUMENTS = 12;
const STATUSES = ['draft', 'submitted', 'approved', 'rejected'];

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const problems = [];

try {
  // The baseline is a floor, not a total: using the application (or an end-to-end
  // run) adds vendors and documents, and that must not read as a seed failure.
  const vendors = await client.query('select count(*)::int as n from docflow.vendor');
  if (vendors.rows[0].n < EXPECTED_VENDORS) {
    problems.push(`expected at least ${EXPECTED_VENDORS} vendors, found ${vendors.rows[0].n}`);
  }

  const documents = await client.query('select count(*)::int as n from docflow.document_header');
  if (documents.rows[0].n < EXPECTED_DOCUMENTS) {
    problems.push(`expected at least ${EXPECTED_DOCUMENTS} documents, found ${documents.rows[0].n}`);
  }

  const seeded = await client.query(
    `select count(*)::int as n from docflow.document_header
      where document_number ~ '^DOC-2026-0000(0[1-9]|1[0-2])$'`,
  );
  if (seeded.rows[0].n !== EXPECTED_DOCUMENTS) {
    problems.push(
      `expected ${EXPECTED_DOCUMENTS} seeded document numbers, found ${seeded.rows[0].n}`,
    );
  }

  const statuses = await client.query(
    'select status, count(*)::int as n from docflow.document_header group by status',
  );
  for (const status of STATUSES) {
    const row = statuses.rows.find((entry) => entry.status === status);
    if (!row) problems.push(`no document in status ${status}`);
  }

  const totals = await client.query(
    `select h.document_number,
            h.total_amount::text as header_total,
            coalesce(sum(d.amount), 0)::text as detail_total,
            h.line_count,
            count(d.detail_id)::int as detail_count
       from docflow.document_header h
       left join docflow.document_detail d on d.shno = h.shno
      group by h.shno`,
  );
  for (const row of totals.rows) {
    if (Number(row.header_total) !== Number(row.detail_total)) {
      problems.push(
        `${row.document_number}: header total ${row.header_total} != detail sum ${row.detail_total}`,
      );
    }
    if (row.line_count !== row.detail_count) {
      problems.push(
        `${row.document_number}: line_count ${row.line_count} != ${row.detail_count} details`,
      );
    }
  }

  const duplicates = await client.query(
    `select document_number, count(*)::int as n
       from docflow.document_header group by document_number having count(*) > 1`,
  );
  if (duplicates.rows.length) {
    problems.push(`duplicate document numbers: ${duplicates.rows.map((r) => r.document_number).join(', ')}`);
  }

  const unlinked = await client.query(
    `select count(*)::int as n from docflow.document_header h
      left join docflow.vendor v on v.id = h.vendor_id where v.id is null`,
  );
  if (unlinked.rows[0].n !== 0) problems.push(`${unlinked.rows[0].n} documents without a vendor`);

  if (problems.length) {
    console.error('seed verification failed:');
    for (const problem of problems) console.error(` - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(
      `seed verified: ${EXPECTED_VENDORS} vendors, ${EXPECTED_DOCUMENTS} documents, totals consistent`,
    );
  }
} finally {
  await client.end();
}
