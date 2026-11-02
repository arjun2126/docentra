import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { targetFor, validateName, appEnvironment, createDatabase, cleanupDatabase } from '../lib/e2e-db.mjs';

const target = targetFor('postgresql://user:secret@localhost:5432/postgres', 'ci', 'a'.repeat(24));
test('direct Playwright invocation refuses before running browser tests', () => {
  const env = { ...process.env, DATABASE_URL: 'postgres://localhost/docentra_dev' };
  delete env.DOCENTRA_E2E_RECEIPT;
  const child = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list'], { env, encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Use npm run test:e2e: direct Playwright invocation is unsafe/);
});
test('target names are fresh, safely configurable and never an existing regular name', () => {
  assert.notEqual(targetFor('postgres://u:p@localhost/postgres').name, targetFor('postgres://u:p@localhost/postgres').name);
  for (const name of ['docentra_dev', 'docentra_test', 'docentra_e2e_old', 'x"; DROP DATABASE docentra_dev;--', target.name + '_extra']) assert.throws(() => validateName(name));
  for (const prefix of ['dev;', '../dev', 'a'.repeat(19), '']) assert.throws(() => targetFor('postgres://u:p@localhost/postgres', prefix));
  assert.throws(() => targetFor('postgres://u:p@localhost/postgres?options=unsafe'));
  assert.throws(() => targetFor('https://localhost/postgres'));
});
test('app environment discards inherited database and process overrides', () => {
  const env = appEnvironment({ DATABASE_URL: 'postgres://localhost/docentra_dev', TEST_DATABASE_URL: 'unsafe', PGDATABASE: 'docentra_dev', PGOPTIONS: 'unsafe', NODE_OPTIONS: 'unsafe', NEXT_PUBLIC_DATABASE_URL: 'secret', PATH: '/bin' }, target);
  assert.equal(env.DATABASE_URL, target.url);
  assert.equal(env.PATH, '/bin');
  for (const key of ['TEST_DATABASE_URL', 'PGDATABASE', 'PGOPTIONS', 'NODE_OPTIONS', 'NEXT_PUBLIC_DATABASE_URL']) assert.equal(env[key], undefined);
  assert.throws(() => appEnvironment({}, { ...target, url: 'postgres://localhost/docentra_dev' }));
});
test('creation collision never returns a receipt or invokes cleanup', async () => {
  const calls = [];
  const admin = { query: async (sql) => { calls.push(sql); throw new Error('already exists'); } };
  await assert.rejects(createDatabase(admin, target), /already exists/);
  assert.deepEqual(calls, [`CREATE DATABASE "${target.name}"`]);
});
test('cleanup refuses unknown, changed and previous databases; only receipt identity can drop', async () => {
  const receipt = { ...target, oid: '123', marker: 'b'.repeat(48) };
  const calls = [];
  let rows = [];
  const admin = { query: async (sql) => { calls.push(sql); return { rows }; } };
  await assert.rejects(cleanupDatabase(admin, { name: 'docentra_dev' }));
  await assert.rejects(cleanupDatabase(admin, target), /receipt/);
  assert.equal(calls.length, 0);
  for (const row of [undefined, { oid: '124', marker: receipt.marker }, { oid: '123', marker: 'c'.repeat(48) }]) {
    rows = row ? [row] : [];
    await assert.rejects(cleanupDatabase(admin, receipt), /ownership/);
  }
  assert.ok(calls.every((sql) => sql.startsWith('SELECT')));
  rows = [{ oid: receipt.oid, marker: receipt.marker }];
  await cleanupDatabase(admin, receipt);
  assert.equal(calls.at(-1), `DROP DATABASE "${target.name}"`);
  assert.ok(calls.every((sql) => !sql.includes('FORCE') && !sql.includes('terminate_backend')));
});
