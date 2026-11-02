// Integration tests against a real PostgreSQL instance.
// These assert the database invariants directly, so they hold regardless of
// which code path writes the data.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://docentra:docentra@localhost:55432/docentra_test';

const client = new Client({ connectionString: TEST_DATABASE_URL });

async function createVendor(code = 'V-T1'): Promise<string> {
  const { rows } = await client.query(
    'insert into docflow.vendor (code, name) values ($1, $2) returning id::text as id',
    [code, `Vendor ${code}`],
  );
  return rows[0].id;
}

async function createHeader(vendorId: string, number = 'DOC-2026-900001', status = 'draft'): Promise<string> {
  const { rows } = await client.query(
    `insert into docflow.document_header (document_number, document_date, vendor_id, status)
     values ($1, current_date, $2, $3) returning shno::text as shno`,
    [number, vendorId, status],
  );
  return rows[0].shno;
}

beforeAll(async () => {
  await client.connect();
  await client.query('drop schema if exists docflow cascade');
  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  const files = readdirSync(migrationsDir)
    .sort()
    .flatMap((dir) =>
      readdirSync(path.join(migrationsDir, dir))
        .filter((file) => file.endsWith('.sql'))
        .map((file) => path.join(migrationsDir, dir, file)),
    );
  if (files.length === 0) throw new Error('no migration files found');
  for (const file of files) {
    await client.query(readFileSync(file, 'utf8'));
  }
}, 30_000);

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await client.query('delete from docflow.document_header');
  await client.query('delete from docflow.vendor');
});

describe('docflow schema invariants', () => {
  test('rejects a line whose amount does not equal quantity * price', async () => {
    const vendorId = await createVendor();
    const shno = await createHeader(vendorId);
    await expect(
      client.query(
        `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
         values ($1, 1, 'Cheat', 2, 10.50, 99.99)`,
        [shno],
      ),
    ).rejects.toThrow(/ck_detail_amount/);
  });

  test('rejects a zero quantity', async () => {
    const vendorId = await createVendor();
    const shno = await createHeader(vendorId);
    await expect(
      client.query(
        `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
         values ($1, 1, 'Nothing', 0, 10, 0)`,
        [shno],
      ),
    ).rejects.toThrow(/quantity/);
  });

  test('rejects an unknown status', async () => {
    const vendorId = await createVendor();
    await expect(createHeader(vendorId, 'DOC-2026-900002', 'archived')).rejects.toThrow(/status/);
  });

  test('keeps header totals and line count in sync with its details', async () => {
    const vendorId = await createVendor();
    const shno = await createHeader(vendorId);
    await client.query(
      `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount) values
         ($1, 1, 'Paper', 2, 10.50, 21.00),
         ($1, 2, 'Toner', 3, 4.25, 12.75)`,
      [shno],
    );
    const { rows } = await client.query(
      'select total_amount::text, line_count from docflow.document_header where shno = $1',
      [shno],
    );
    expect(rows[0].total_amount).toBe('33.75');
    expect(rows[0].line_count).toBe(2);
  });

  test('recomputes totals when a detail is deleted', async () => {
    const vendorId = await createVendor();
    const shno = await createHeader(vendorId);
    await client.query(
      `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount) values
         ($1, 1, 'Paper', 2, 10.50, 21.00),
         ($1, 2, 'Toner', 3, 4.25, 12.75)`,
      [shno],
    );
    await client.query('delete from docflow.document_detail where shno = $1 and line_no = 2', [shno]);
    const { rows } = await client.query(
      'select total_amount::text, line_count from docflow.document_header where shno = $1',
      [shno],
    );
    expect(rows[0].total_amount).toBe('21.00');
    expect(rows[0].line_count).toBe(1);
  });

  test('cascades detail deletion when a header is deleted', async () => {
    const vendorId = await createVendor();
    const shno = await createHeader(vendorId);
    await client.query(
      `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
       values ($1, 1, 'Paper', 2, 10.50, 21.00)`,
      [shno],
    );
    await client.query('delete from docflow.document_header where shno = $1', [shno]);
    const { rows } = await client.query('select count(*)::int as n from docflow.document_detail');
    expect(rows[0].n).toBe(0);
  });

  test('restricts deleting a vendor that still has documents', async () => {
    const vendorId = await createVendor();
    await createHeader(vendorId);
    await expect(client.query('delete from docflow.vendor where id = $1', [vendorId])).rejects.toThrow(
      /foreign key|violates/i,
    );
  });
});
