import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://docentra:docentra@127.0.0.1:56000/docentra_test";

export async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Drop and replay the migrations. Integration files each own their fixtures, so
 * no file can pass only because another file left data behind.
 */
export async function resetSchema(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  await withClient(async (client) => {
    await client.query("drop schema if exists docflow cascade");
    for (const dir of dirs) {
      const sql = readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
      await client.query(sql);
    }
  });
}

export async function insertVendor(
  client: pg.Client,
  code: string,
  name: string,
): Promise<string> {
  const { rows } = await client.query(
    `insert into docflow.vendor (code, name) values ($1, $2) returning id::text as id`,
    [code, name],
  );
  return rows[0].id;
}

export async function insertDocument(
  client: pg.Client,
  input: {
    number: string;
    date: string;
    vendorId: string;
    status?: string;
    items: Array<{ item: string; quantity: string; price: string }>;
  },
): Promise<string> {
  // Lines must be added while the document is still a draft: the immutability
  // guard rejects new lines on an approved document. Fixtures follow the real
  // flow instead of bypassing it.
  const { rows } = await client.query(
    `insert into docflow.document_header (document_number, document_date, vendor_id, status)
     values ($1, $2, $3, 'draft') returning shno::text as shno`,
    [input.number, input.date, input.vendorId],
  );
  const shno = rows[0].shno;
  let lineNo = 0;
  for (const item of input.items) {
    lineNo += 1;
    await client.query(
      `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
       values ($1, $2, $3, $4, $5, round($4::numeric * $5::numeric, 2))`,
      [shno, lineNo, item.item, item.quantity, item.price],
    );
  }
  if (input.status && input.status !== "draft") {
    await client.query("update docflow.document_header set status = $1 where shno = $2", [
      input.status,
      shno,
    ]);
  }
  return shno;
}
