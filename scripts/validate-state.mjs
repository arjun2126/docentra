// CLI wrapper for state validation (used by gate G1).
import { loadState, statePath } from './lib/state.mjs';

const file = process.argv[2] ? process.argv[2] : statePath();
try {
  const state = loadState(file);
  const pending = state.tasks.filter((t) => t.status !== 'done').length;
  console.log(`state ok: ${state.tasks.length} tasks, ${pending} not done (${file})`);
  process.exit(0);
} catch (err) {
  console.error(`state invalid: ${err.message}`);
  process.exit(1);
}
