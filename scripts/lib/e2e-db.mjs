import pg from 'pg';
import { randomBytes } from 'node:crypto';

export function validateName(name) {
  if (!/^docentra_e2e_[a-z0-9_]{1,18}_[a-f0-9]{24}$/.test(name)) throw new Error('Refusing non-disposable E2E database name');
  return name;
}

export function targetFor(adminUrl, prefix = 'run', token = randomBytes(12).toString('hex')) {
  if (!/^[a-z0-9_]{1,18}$/.test(prefix)) throw new Error('Invalid E2E_DATABASE_PREFIX');
  const url = new URL(adminUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) throw new Error('Admin URL must be a plain PostgreSQL connection URL');
  const name = validateName(`docentra_e2e_${prefix}_${token}`);
  url.pathname = `/${name}`;
  return { name, url: url.toString() };
}

export function appEnvironment(env, target) {
  validateName(target.name);
  if (decodeURIComponent(new URL(target.url).pathname.slice(1)) !== target.name) throw new Error('E2E URL/name mismatch');
  // Do not pass inherited Prisma overrides, Next settings, or .env files through.
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'CI'].includes(key)));
  return { ...clean, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: target.url };
}

export async function createDatabase(admin, target) {
  validateName(target.name);
  // No IF NOT EXISTS: collision never grants cleanup ownership.
  await admin.query(`CREATE DATABASE "${target.name}"`);
  const { rows } = await admin.query('SELECT oid::text FROM pg_database WHERE datname=$1', [target.name]);
  const owned = { ...target, oid: rows[0].oid, marker: randomBytes(24).toString('hex') };
  await admin.query(`COMMENT ON DATABASE "${target.name}" IS '${owned.marker}'`);
  return owned;
}

export async function cleanupDatabase(admin, owned) {
  validateName(owned.name);
  if (!owned.oid || !/^[a-f0-9]{48}$/.test(owned.marker ?? '')) throw new Error('Cleanup requires creation receipt');
  const { rows } = await admin.query("SELECT oid::text, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=$1", [owned.name]);
  if (rows.length !== 1 || rows[0].oid !== owned.oid || rows[0].marker !== owned.marker) throw new Error('Cleanup refused: database ownership identity changed');
  // No FORCE, no backend termination, no enumeration of older disposable DBs.
  await admin.query(`DROP DATABASE "${owned.name}"`);
}

export async function fingerprint(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = {};
    for (const [table, key] of [['vendor', 'id'], ['document_header', 'shno'], ['document_detail', 'detail_id']]) {
      const { rows } = await client.query(`SELECT row_to_json(t) AS row FROM docflow.${table} t ORDER BY ${key}`);
      const hash = await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text, chr(10) ORDER BY row_to_json(t)::text), '')) AS fingerprint FROM docflow.${table} t`);
      result[table] = { ...hash.rows[0], rows: rows.map((r) => r.row) };
    }
    await client.query('COMMIT');
    return result;
  } finally { await client.end(); }
}
