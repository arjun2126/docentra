// Idempotent demonstration data. Safe to run repeatedly: vendors are keyed by
// code, documents by document_number, and details are replaced per document.
// Amounts are plain numbers; no currency symbol, code or locale formatting.
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://docentra:docentra@127.0.0.1:56000/docentra_dev';

const vendors = [
  { code: 'V-001', name: 'Northwind Paper', email: 'sales@northwind.example', phone: '+1-555-0101', address: '18 Mill Lane, Portland' },
  { code: 'V-002', name: 'Baltic Office Supply', email: 'orders@baltic.example', phone: '+1-555-0102', address: '4 Harbour Road, Riga' },
  { code: 'V-003', name: 'Cedar Print Works', email: 'hello@cedarprint.example', phone: '+1-555-0103', address: '92 Cedar Street, Austin' },
  { code: 'V-004', name: 'Meridian Hardware', email: 'team@meridian.example', phone: '+1-555-0104', address: '7 Meridian Way, Denver' },
  { code: 'V-005', name: 'Lantern Cleaning Co', email: 'service@lantern.example', phone: '+1-555-0105', address: '31 Lantern Court, Boston' },
  { code: 'V-006', name: 'Orbit IT Services', email: 'support@orbit.example', phone: '+1-555-0106', address: '120 Orbit Plaza, Seattle' },
];

// Spread across four months and all four statuses so search, filters, date
// ranges and dashboard metrics demonstrate real behaviour.
const documents = [
  {
    number: 'DOC-2026-000001', date: '2026-06-03', vendor: 'V-001', status: 'approved',
    notes: 'Quarterly paper restock',
    items: [
      { item: 'A4 paper, 500 sheets', quantity: '20', price: '4.25' },
      { item: 'A3 paper, 500 sheets', quantity: '5', price: '7.10' },
    ],
  },
  {
    number: 'DOC-2026-000002', date: '2026-06-11', vendor: 'V-002', status: 'approved',
    notes: 'Desk supplies for the new floor',
    items: [
      { item: 'Stapler', quantity: '4', price: '12.99' },
      { item: 'Staples, box', quantity: '10', price: '1.45' },
      { item: 'Hole punch', quantity: '2', price: '18.00' },
    ],
  },
  {
    number: 'DOC-2026-000003', date: '2026-06-24', vendor: 'V-003', status: 'approved',
    notes: 'Summer brochure print run',
    items: [
      { item: 'Brochure, 8pp', quantity: '500', price: '0.42' },
      { item: 'Folding', quantity: '500', price: '0.08' },
      { item: 'Delivery', quantity: '1', price: '45.00' },
      { item: 'Proof copy', quantity: '2', price: '15.00' },
    ],
  },
  {
    number: 'DOC-2026-000004', date: '2026-07-02', vendor: 'V-004', status: 'rejected',
    notes: 'Rejected: prices above the agreed quote',
    items: [{ item: 'Shelving bracket', quantity: '24', price: '3.75' }],
  },
  {
    number: 'DOC-2026-000005', date: '2026-07-09', vendor: 'V-001', status: 'approved',
    notes: 'Archive boxes for records',
    items: [
      { item: 'Archive box', quantity: '30', price: '2.20' },
      { item: 'Box labels', quantity: '30', price: '0.15' },
    ],
  },
  {
    number: 'DOC-2026-000006', date: '2026-07-21', vendor: 'V-002', status: 'submitted',
    notes: 'Pantry supplies, awaiting sign-off',
    items: [
      { item: 'Coffee, 1kg', quantity: '6', price: '14.80' },
      { item: 'Filters', quantity: '4', price: '3.30' },
      { item: 'Cups, pack', quantity: '8', price: '2.05' },
    ],
  },
  {
    number: 'DOC-2026-000007', date: '2026-08-04', vendor: 'V-005', status: 'approved',
    notes: 'Monthly contract cleaning',
    items: [
      { item: 'Cleaning service, August', quantity: '1', price: '420.00' },
      { item: 'Window cleaning', quantity: '2', price: '85.00' },
    ],
  },
  {
    number: 'DOC-2026-000008', date: '2026-08-13', vendor: 'V-006', status: 'submitted',
    notes: 'Workstation refresh',
    items: [
      { item: 'Docking station', quantity: '6', price: '129.00' },
      { item: 'USB-C cable, 2m', quantity: '6', price: '9.50' },
    ],
  },
  {
    number: 'DOC-2026-000009', date: '2026-08-27', vendor: 'V-003', status: 'draft',
    notes: 'Autumn catalogue, still being priced',
    items: [
      { item: 'Catalogue, 16pp', quantity: '2000', price: '0.61' },
      { item: 'Perfect binding', quantity: '2000', price: '0.19' },
    ],
  },
  {
    number: 'DOC-2026-000010', date: '2026-09-08', vendor: 'V-004', status: 'approved',
    notes: 'Workshop consumables',
    items: [
      { item: 'Drill bit set', quantity: '3', price: '34.90' },
      { item: 'Safety gloves, pair', quantity: '12', price: '6.40' },
      { item: 'Masking tape', quantity: '20', price: '1.85' },
    ],
  },
  {
    number: 'DOC-2026-000011', date: '2026-09-19', vendor: 'V-005', status: 'rejected',
    notes: 'Rejected: duplicate of the August contract',
    items: [{ item: 'Cleaning service, September', quantity: '1', price: '420.00' }],
  },
  {
    number: 'DOC-2026-000012', date: '2026-10-01', vendor: 'V-006', status: 'draft',
    notes: 'Backup drives for the archive project',
    items: [
      { item: 'External SSD, 2TB', quantity: '4', price: '164.00' },
      { item: 'Label printer', quantity: '1', price: '89.99' },
    ],
  },
];

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  await client.query('begin');
  // Demonstration data is rebuilt from scratch on every run. Approved documents
  // are immutable for the application, so the seeder opts into the scoped
  // maintenance override for this transaction only, then restores each
  // document's real status below.
  await client.query("select set_config('docflow.maintenance', 'on', true)");

  const vendorIds = new Map();
  for (const vendor of vendors) {
    const { rows } = await client.query(
      `insert into docflow.vendor (code, name, email, phone, address)
       values ($1, $2, $3, $4, $5)
       on conflict (code) do update
         set name = excluded.name, email = excluded.email, phone = excluded.phone,
             address = excluded.address, updated_at = now()
       returning id::text as id`,
      [vendor.code, vendor.name, vendor.email, vendor.phone, vendor.address],
    );
    vendorIds.set(vendor.code, rows[0].id);
  }

  for (const document of documents) {
    const vendorId = vendorIds.get(document.vendor);
    if (!vendorId) throw new Error(`unknown vendor code in seed: ${document.vendor}`);
    const { rows } = await client.query(
      `insert into docflow.document_header (document_number, document_date, vendor_id, status, notes)
       values ($1, $2, $3, 'draft', $4)
       on conflict (document_number) do update
         set document_date = excluded.document_date,
             vendor_id = excluded.vendor_id,
             status = 'draft',
             notes = excluded.notes,
             updated_at = now()
       returning shno::text as shno`,
      [document.number, document.date, vendorId, document.notes],
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

    await client.query(
      'update docflow.document_header set status = $1 where shno = $2',
      [document.status, shno],
    );
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
