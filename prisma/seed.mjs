// Idempotent demonstration data. Safe to run repeatedly: vendors are keyed by
// code, documents by document_number, and details are replaced per document.
// Amounts are plain numbers; no currency symbol, code or locale formatting.
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://docentra:docentra@localhost:55432/docentra_dev';

const vendors = [
  { code: 'V-001', name: 'Northwind Paper', email: 'sales@northwind.example', phone: '+1-555-0101' },
  { code: 'V-002', name: 'Baltic Office Supply', email: 'orders@baltic.example', phone: '+1-555-0102' },
  { code: 'V-003', name: 'Cedar Print Works', email: 'hello@cedarprint.example', phone: '+1-555-0103' },
  { code: 'V-004', name: 'Meridian Hardware', email: 'team@meridian.example', phone: '+1-555-0104' },
];

const documents = [
  {
    number: 'DOC-2026-000001',
    date: '2026-09-02',
    vendor: 'V-001',
    status: 'draft',
    notes: 'Quarterly paper restock',
    items: [
      { item: 'A4 paper, 500 sheets', quantity: '20', price: '4.25' },
      { item: 'A3 paper, 500 sheets', quantity: '5', price: '7.10' },
    ],
  },
  {
    number: 'DOC-2026-000002',
    date: '2026-09-05',
    vendor: 'V-002',
    status: 'submitted',
    notes: 'Desk supplies',
    items: [
      { item: 'Stapler', quantity: '4', price: '12.99' },
      { item: 'Staples, box', quantity: '10', price: '1.45' },
      { item: 'Hole punch', quantity: '2', price: '18.00' },
    ],
  },
  {
    number: 'DOC-2026-000003',
    date: '2026-09-11',
    vendor: 'V-003',
    status: 'approved',
    notes: 'Brochure print run',
    items: [
      { item: 'Brochure, 8pp', quantity: '500', price: '0.42' },
      { item: 'Folding', quantity: '500', price: '0.08' },
      { item: 'Delivery', quantity: '1', price: '45.00' },
      { item: 'Proof copy', quantity: '2', price: '15.00' },
    ],
  },
  {
    number: 'DOC-2026-000004',
    date: '2026-09-18',
    vendor: 'V-004',
    status: 'rejected',
    notes: 'Rejected: prices above quote',
    items: [{ item: 'Shelving bracket', quantity: '24', price: '3.75' }],
  },
  {
    number: 'DOC-2026-000005',
    date: '2026-09-24',
    vendor: 'V-001',
    status: 'approved',
    notes: 'Archive boxes',
    items: [
      { item: 'Archive box', quantity: '30', price: '2.20' },
      { item: 'Box labels', quantity: '30', price: '0.15' },
    ],
  },
  {
    number: 'DOC-2026-000006',
    date: '2026-09-30',
    vendor: 'V-002',
    status: 'draft',
    notes: 'Pantry supplies',
    items: [
      { item: 'Coffee, 1kg', quantity: '6', price: '14.80' },
      { item: 'Filters', quantity: '4', price: '3.30' },
      { item: 'Cups, pack', quantity: '8', price: '2.05' },
    ],
  },
];

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  await client.query('begin');

  const vendorIds = new Map();
  for (const vendor of vendors) {
    const { rows } = await client.query(
      `insert into docflow.vendor (code, name, email, phone)
       values ($1, $2, $3, $4)
       on conflict (code) do update
         set name = excluded.name, email = excluded.email, phone = excluded.phone, updated_at = now()
       returning id::text as id`,
      [vendor.code, vendor.name, vendor.email, vendor.phone],
    );
    vendorIds.set(vendor.code, rows[0].id);
  }

  for (const document of documents) {
    const vendorId = vendorIds.get(document.vendor);
    if (!vendorId) throw new Error(`unknown vendor code in seed: ${document.vendor}`);
    const { rows } = await client.query(
      `insert into docflow.document_header (document_number, document_date, vendor_id, status, notes)
       values ($1, $2, $3, $4, $5)
       on conflict (document_number) do update
         set document_date = excluded.document_date,
             vendor_id = excluded.vendor_id,
             status = excluded.status,
             notes = excluded.notes,
             updated_at = now()
       returning shno::text as shno`,
      [document.number, document.date, vendorId, document.status, document.notes],
    );
    const shno = rows[0].shno;

    await client.query('delete from docflow.document_detail where shno = $1', [shno]);

    let lineNo = 0;
    for (const item of document.items) {
      lineNo += 1;
      await client.query(
        `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
         values ($1, $2, $3, $4, $5, round($4::numeric * $5::numeric, 2))`,
        [shno, lineNo, item.item, item.quantity, item.price],
      );
    }
  }

  await client.query('commit');
  console.log(`seeded ${vendors.length} vendors and ${documents.length} documents`);
} catch (error) {
  await client.query('rollback');
  console.error(`seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
