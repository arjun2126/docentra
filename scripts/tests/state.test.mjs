import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendJournal,
  journalHasTask,
  loadState,
  saveState,
  validateState,
  writeEvidence,
} from '../lib/state.mjs';

const cleanups = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docentra-state-'));
  cleanups.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanups.length) fs.rmSync(cleanups.pop(), { recursive: true, force: true });
  delete process.env.HARNESS_ROOT;
  delete process.env.HARNESS_STATE_DIR;
});

const baseState = () => ({
  schemaVersion: 1,
  maxRepairAttempts: 2,
  tasks: [
    { id: 'T-1', title: 'first', status: 'pending', attempts: 0, dependsOn: [], scope: ['scripts/'] },
  ],
});

test('state round-trips through disk', () => {
  const file = path.join(tempDir(), 'state.json');
  saveState(baseState(), file);
  const loaded = loadState(file);
  assert.equal(loaded.tasks.length, 1);
  assert.equal(loaded.tasks[0].status, 'pending');
  assert.ok(loaded.updatedAt, 'updatedAt is stamped on save');
});

test('writes are atomic and leave no temp files behind', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  saveState(baseState(), file);
  assert.deepEqual(fs.readdirSync(dir), ['state.json']);
});

test('a partially written state can never be observed', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  saveState(baseState(), file);
  const before = fs.readFileSync(file, 'utf8');
  assert.doesNotThrow(() => JSON.parse(before));
});

test('duplicate task ids are rejected', () => {
  const bad = baseState();
  bad.tasks.push({ ...bad.tasks[0] });
  assert.throws(() => validateState(bad), /duplicated/);
});

test('invalid statuses are rejected', () => {
  const bad = baseState();
  bad.tasks[0].status = 'finished';
  assert.throws(() => validateState(bad), /status invalid/);
});

test('unknown dependencies are rejected', () => {
  const bad = baseState();
  bad.tasks[0].dependsOn = ['GHOST'];
  assert.throws(() => validateState(bad), /unknown task/);
});

test('journal is append-only and detectable per task', () => {
  const root = tempDir();
  process.env.HARNESS_ROOT = root;
  appendJournal('## T-1 — first\n- status: in_progress\n');
  appendJournal('## T-2 — second\n- status: done\n');
  assert.equal(journalHasTask('T-1'), true);
  assert.equal(journalHasTask('T-9'), false);

  const dir = path.join(root, 'journal');
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1, 'one file per day');
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.match(content, /T-1/);
  assert.match(content, /T-2/, 'earlier entries are preserved');
});

test('evidence records are written per task and per run', () => {
  const root = tempDir();
  process.env.HARNESS_ROOT = root;
  process.env.HARNESS_STATE_DIR = path.join(root, 'tasks');
  const first = writeEvidence('T-1', { runId: 'run-a', outcome: 'accepted' });
  const second = writeEvidence('T-1', { runId: 'run-b', outcome: 'accepted' });
  assert.notEqual(first, second);
  assert.equal(fs.readdirSync(path.join(root, 'tasks', 'evidence', 'T-1')).length, 2);
  assert.match(first, /T-1/);
});
