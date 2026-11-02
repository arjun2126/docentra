import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";

export default async function globalSetup() {
  const receipt = JSON.parse(await readFile(process.env.DOCENTRA_E2E_RECEIPT!, "utf8"));
  assert.equal(new URL(receipt.url).pathname, `/${receipt.name}`);
  const address = new URL(receipt.baseURL);
  assert.equal(address.protocol, "http:");
  assert.equal(address.hostname, "127.0.0.1");
  assert.ok(address.port);
  const db = new pg.Client({ connectionString: receipt.url });
  await db.connect();
  try {
    const { rows } = await db.query("SELECT current_database() AS name, oid::text, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
    assert.deepEqual(rows[0], { name: receipt.name, oid: receipt.oid, marker: receipt.marker });
    assert.deepEqual((await db.query("SELECT code, name FROM docflow.vendor ORDER BY id")).rows,
      [{ code: "E2E-SEED", name: "Deterministic seed" }]);
    // Bind the HTTP server to this target BEFORE any browser writes. A copied
    // receipt, wrong port, or accidentally reused development server cannot pass
    // this fresh database-to-HTTP challenge. No identity/credential endpoint.
    const challenge = `E2E identity ${randomBytes(24).toString("hex")}`;
    try {
      await db.query("UPDATE docflow.vendor SET name=$1 WHERE code='E2E-SEED'", [challenge]);
      const response = await fetch(`${receipt.baseURL}/vendors`, { signal: AbortSignal.timeout(15_000) });
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes(challenge), "HTTP app is not using the dedicated E2E database; refusing browser writes");
      console.log(`Verified database-to-HTTP identity: ${receipt.name}`);
    } finally {
      await db.query("UPDATE docflow.vendor SET name='Deterministic seed', updated_at='2026-01-01T00:00:00Z' WHERE code='E2E-SEED'");
    }
  } finally { await db.end(); }
}
