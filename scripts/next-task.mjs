// Deterministic task selection. Same input => same output. No model involved.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, statePath } from './lib/state.mjs';

/**
 * Decide what the loop should do next.
 *
 * Precedence: resume in-flight work, then any ready task whose dependencies are
 * done, and only then report an open approval gate. An approval gate blocks its
 * dependents, not independent authorized work that is already approved.
 */
export function selectNext(state) {
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const isDone = (id) => byId.get(id)?.status === 'done';
  const depsMet = (t) => (t.dependsOn ?? []).every(isDone);

  const inProgress = state.tasks.find((t) => t.status === 'in_progress');
  if (inProgress) return { kind: 'resume', task: inProgress };

  const ready = state.tasks.filter((t) => t.status === 'pending' && depsMet(t));
  if (ready.length) return { kind: 'task', task: ready[0] };

  const awaiting = state.tasks.find((t) => t.status === 'awaiting_approval');
  if (awaiting) return { kind: 'awaiting_approval', task: awaiting };

  const blocked = state.tasks.filter((t) => t.status === 'blocked');
  if (blocked.length) {
    const stranded = state.tasks.filter((t) => t.status === 'pending').map((t) => t.id);
    return { kind: 'blocked', task: blocked[0], stranded };
  }

  return { kind: 'none' };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const selection = selectNext(loadState());
    console.log(JSON.stringify(selection, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(`next-task: ${err.message}`);
    process.exit(1);
  }
}
