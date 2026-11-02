// Independent review pass. Read-only: it judges evidence, never edits code.
//
// This is the deterministic policy reviewer. It exists so the reviewer slot is
// a real, separate step that can reject a task, and so review is reproducible.
// A model-based reviewer plugs in through HARNESS_REVIEWER_CMD without changing
// the loop (see AGENTS.md); its verdict shape must match this one.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAX_ATTEMPTS, findTask, journalHasTask, loadState } from './lib/state.mjs';
import fs from 'node:fs';

/** Review one task's evidence against the task definition and the contract. */
export function reviewEvidence({ task, evidence, maxAttempts = DEFAULT_MAX_ATTEMPTS, hasJournal = true }) {
  const reasons = [];

  if (!evidence) {
    return { verdict: 'reject', reasons: ['no evidence record was produced'] };
  }

  const transcript = evidence.gate?.transcript ?? '';
  if (evidence.gate?.exitCode !== 0) {
    reasons.push(`gate exited ${evidence.gate?.exitCode}`);
  }
  if (!transcript.includes('GATES: PASS')) {
    reasons.push('gate transcript does not report GATES: PASS');
  }
  if ((task.acceptance ?? '') !== (evidence.taskAcceptance ?? '')) {
    reasons.push('evidence acceptance command does not match the task definition');
  }

  // Unbounded scope is rejected: a task must declare what it may touch.
  if (!Array.isArray(task.scope) || task.scope.length === 0) {
    reasons.push('task scope is empty: changes would be unbounded');
  } else {
    for (const file of evidence.changedFiles ?? []) {
      if (!task.scope.some((prefix) => file === prefix || file.startsWith(prefix))) {
        reasons.push(`change outside declared scope: ${file}`);
      }
    }
  }

  if (!hasJournal) reasons.push('no journal entry recorded for this task');
  if ((task.attempts ?? 0) > maxAttempts) {
    reasons.push(`attempts (${task.attempts}) exceeded bound (${maxAttempts})`);
  }
  if (evidence.implementer?.invoked === false && task.synthetic !== true) {
    reasons.push('no implementer ran for a non-synthetic task');
  }

  return { verdict: reasons.length === 0 ? 'accept' : 'reject', reasons };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const taskId = process.env.TASK_ID;
  const evidencePath = process.env.EVIDENCE_PATH;
  try {
    if (!taskId) throw new Error('TASK_ID is required');
    if (!evidencePath) throw new Error('EVIDENCE_PATH is required');
    const state = loadState();
    const task = findTask(state, taskId);
    if (!task) throw new Error(`unknown task: ${taskId}`);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    const verdict = reviewEvidence({
      task,
      evidence,
      maxAttempts: state.maxRepairAttempts ?? DEFAULT_MAX_ATTEMPTS,
      hasJournal: journalHasTask(task.id),
    });
    console.log(JSON.stringify(verdict, null, 2));
    process.exit(verdict.verdict === 'accept' ? 0 : 1);
  } catch (err) {
    console.log(JSON.stringify({ verdict: 'reject', reasons: [err.message] }, null, 2));
    process.exit(1);
  }
}
