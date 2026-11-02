// Persistent execution state. No dependencies, no framework.
// Atomic writes so a hard kill cannot corrupt tasks/state.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Root of the harness code (this checkout). Never overridden. */
export const CODE_ROOT = path.resolve(HERE, '..', '..');

export const DEFAULT_MAX_ATTEMPTS = 2;
export const VALID_STATUSES = [
  'pending',
  'in_progress',
  'review',
  'done',
  'blocked',
  'awaiting_approval',
];

/** Root of run data. HARNESS_ROOT isolates verification runs. */
export function dataRoot() {
  return process.env.HARNESS_ROOT
    ? path.resolve(process.env.HARNESS_ROOT)
    : CODE_ROOT;
}

export function stateDir() {
  return process.env.HARNESS_STATE_DIR
    ? path.resolve(process.env.HARNESS_STATE_DIR)
    : path.join(dataRoot(), 'tasks');
}

export function statePath() {
  return path.join(stateDir(), 'state.json');
}

export function evidenceDir() {
  return path.join(stateDir(), 'evidence');
}

export function journalDir() {
  return path.join(dataRoot(), 'journal');
}

export const nowIso = () => new Date().toISOString();

export function newRunId() {
  const stamp = nowIso().replace(/[:.]/g, '-');
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('state must be a JSON object');
  }
  if (state.schemaVersion !== 1) errors.push(`schemaVersion must be 1, got ${state.schemaVersion}`);
  if (!Array.isArray(state.tasks)) {
    errors.push('tasks must be an array');
  } else {
    const ids = new Set();
    state.tasks.forEach((task, i) => {
      const at = `tasks[${i}]`;
      if (!task || typeof task !== 'object') { errors.push(`${at} must be an object`); return; }
      if (!task.id) errors.push(`${at}.id is required`);
      else if (ids.has(task.id)) errors.push(`${at}.id duplicated: ${task.id}`);
      else ids.add(task.id);
      if (!task.title) errors.push(`${at}.title is required`);
      if (!VALID_STATUSES.includes(task.status)) {
        errors.push(`${at}.status invalid: ${task.status}`);
      }
      if (task.dependsOn !== undefined && !Array.isArray(task.dependsOn)) {
        errors.push(`${at}.dependsOn must be an array`);
      }
      if (task.attempts !== undefined && !Number.isInteger(task.attempts)) {
        errors.push(`${at}.attempts must be an integer`);
      }
    });
    state.tasks.forEach((task, i) => {
      for (const dep of task?.dependsOn ?? []) {
        if (!ids.has(dep)) errors.push(`tasks[${i}].dependsOn references unknown task: ${dep}`);
      }
    });
  }
  if (errors.length) {
    const err = new Error(`state schema invalid:\n - ${errors.join('\n - ')}`);
    err.errors = errors;
    throw err;
  }
  return true;
}

export function loadState(file = statePath()) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`cannot read state at ${file}: ${cause.message}`);
  }
  validateState(parsed);
  return parsed;
}

/** Write via temp file + rename: readers never see a partial state. */
export function saveState(state, file = statePath()) {
  validateState(state);
  state.updatedAt = nowIso();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return state;
}

export function appendJournal(markdown, { date = new Date() } = {}) {
  const dir = journalDir();
  fs.mkdirSync(dir, { recursive: true });
  const day = date.toISOString().slice(0, 10);
  const file = path.join(dir, `${day}.md`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, `# Execution journal — ${day}\n`);
  fs.appendFileSync(file, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  return file;
}

export function writeEvidence(taskId, record) {
  const dir = path.join(evidenceDir(), taskId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.runId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

export function journalHasTask(taskId) {
  const dir = journalDir();
  if (!fs.existsSync(dir)) return false;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes(taskId));
}

export function findTask(state, id) {
  return state.tasks.find((t) => t.id === id);
}
