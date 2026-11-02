import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { targetFor, appEnvironment, createDatabase, cleanupDatabase, fingerprint } from './lib/e2e-db.mjs';

const root = resolve('.');
const work = await mkdtemp(join(tmpdir(), 'docentra-e2e-'));
console.log(`E2E artifacts: ${work}`);
const protectedUrl = process.env.DATABASE_URL;
if (!protectedUrl) throw new Error('DATABASE_URL required for read-only before/after preservation check');
const adminUrl = new URL(process.env.E2E_ADMIN_DATABASE_URL ?? protectedUrl);
if (!process.env.E2E_ADMIN_DATABASE_URL) adminUrl.pathname = '/postgres';
const target = targetFor(adminUrl.toString(), process.env.E2E_DATABASE_PREFIX);
const env = appEnvironment(process.env, target);
const admin = new pg.Client({ connectionString: adminUrl.toString() });
let owned;
let server;
let before;
let interrupted = false;
const children = new Set();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true;
  for (const child of children) child.kill('SIGTERM');
});
const report = { target: target.name, cleanup: false, preserved: false };
function run(command, args, cwd, childEnv = env) {
  return new Promise((ok, fail) => {
    if (interrupted) return fail(new Error('E2E interrupted'));
    const child = spawn(command, args, { cwd, env: childEnv, stdio: 'inherit' });
    children.add(child);
    child.once('exit', () => children.delete(child));
    child.once('error', fail);
    child.once('exit', (code, signal) => code === 0 ? ok() : fail(new Error(`${command} failed (${code ?? signal})`)));
  });
}
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
}
try {
  before = await fingerprint(protectedUrl);
  await writeFile(join(work, 'development-before.json'), JSON.stringify(before, null, 2));
  await admin.connect();
  owned = await createDatabase(admin, target);
  console.log(`Created dedicated E2E database: ${target.name}`);
  await run(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], root);
  const db = new pg.Client({ connectionString: target.url });
  await db.connect();
  try {
    const identity = await db.query('SELECT current_database() AS name');
    if (identity.rows[0].name !== target.name) throw new Error('Wrong migration target');
    await db.query("INSERT INTO docflow.vendor (code,name,created_at,updated_at) VALUES ('E2E-SEED','Deterministic seed','2026-01-01Z','2026-01-01Z')");
    report.seed = await fingerprint(target.url);
    if (report.seed.vendor.count !== 1 || report.seed.document_header.count !== 0 || report.seed.document_detail.count !== 0) throw new Error('Unexpected seed state');
  } finally { await db.end(); }

  const app = join(work, 'app');
  await mkdir(app);
  for (const name of ['app', 'components', 'lib', 'prisma', 'package.json', 'package-lock.json', 'eslint.config.mjs', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs', 'tailwind.config.ts']) {
    await cp(join(root, name), join(app, name), { recursive: true });
  }
  await symlink(join(root, 'node_modules'), join(app, 'node_modules'), 'dir');
  await run(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build'], app);
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((ok) => socket.close(ok));
  const baseURL = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: app, env, stdio: 'inherit' });
  children.add(server);
  server.once('exit', () => children.delete(server));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (interrupted) throw new Error('E2E interrupted');
    if (server.exitCode !== null) throw new Error('Dedicated app failed to start (no existing server reuse)');
    try { if ((await fetch(`${baseURL}/vendors`)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  if (!ready) throw new Error('Dedicated app readiness timeout');
  const receipt = join(work, 'launch.json');
  await writeFile(receipt, JSON.stringify({ ...owned, baseURL }), { mode: 0o600 });
  await run(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test'], root,
    { ...env, DOCENTRA_E2E_RECEIPT: receipt, E2E_ARTIFACT_DIR: work });
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopServer();
  try {
    if (before) {
      const after = await fingerprint(protectedUrl);
      await writeFile(join(work, 'development-after.json'), JSON.stringify(after, null, 2));
      report.preserved = isDeepStrictEqual(before, after);
      if (!report.preserved) {
        console.error('Protected database changed during E2E');
        process.exitCode = 1;
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  try {
    if (owned) { await cleanupDatabase(admin, owned); report.cleanup = true; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  await admin.end();
  await writeFile(join(work, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
