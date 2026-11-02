// Task loop: Manager → Implementer → Gates → Reviewer → checkpoint.
//
// No framework, no model embedded. The implementer and reviewer are external
// commands behind environment seams; when they are absent the loop records that
// fact instead of pretending a model ran.
//
//   HARNESS_IMPLEMENTER_CMD   command that edits code (read TASK_BRIEF on stdin)
//   HARNESS_REVIEWER_CMD      command that emits {"verdict":"accept"|"reject",...}
//   HARNESS_MAX_ITERATIONS    safety bound (default 25)
//   HARNESS_CRASH_AFTER       hard-kill after N completed tasks (resume testing)
//
// Exit codes: 0 = authorized work complete or awaiting approval, 1 = blocked,
// anything else = crash (state survives; rerun to resume).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  CODE_ROOT,
  DEFAULT_MAX_ATTEMPTS,
  appendJournal,
  findTask,
  journalHasTask,
  loadState,
  newRunId,
  nowIso,
  saveState,
  writeEvidence,
} from './lib/state.mjs';
import { selectNext } from './next-task.mjs';
import { reviewEvidence } from './review.mjs';

const MAX_ITERATIONS = Number(process.env.HARNESS_MAX_ITERATIONS ?? 25);

// Harness-owned paths never count as implementation changes.
const HARNESS_OWNED = ['tasks/', 'journal/', '.harness-tmp/'];

function changedFiles() {
  const result = spawnSync('git', ['-C', CODE_ROOT, 'status', '--porcelain'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return { gitTracked: false, files: [] };
  const files = (result.stdout ?? '')
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .filter((file) => !HARNESS_OWNED.some((p) => file.startsWith(p)));
  return { gitTracked: true, files };
}

function runImplementer(task) {
  const command = process.env.HARNESS_IMPLEMENTER_CMD;
  if (!command) {
    return {
      invoked: false,
      reason: task.synthetic === true
        ? 'synthetic task: no implementer required'
        : 'HARNESS_IMPLEMENTER_CMD is not set',
    };
  }
  const brief = [
    `Task ${task.id}: ${task.title}`,
    '',
    task.brief ?? '(no additional brief)',
    '',
    `Scope: ${(task.scope ?? []).join(', ') || '(none declared)'}`,
    `Acceptance: ${task.acceptance ?? '(none)'}`,
  ].join('\n');

  const result = spawnSync('bash', ['-c', command], {
    cwd: CODE_ROOT,
    encoding: 'utf8',
    input: brief,
    env: {
      ...process.env,
      TASK_ID: task.id,
      TASK_TITLE: task.title,
      TASK_SCOPE: (task.scope ?? []).join(','),
      TASK_ACCEPTANCE: task.acceptance ?? '',
      TASK_BRIEF: brief,
    },
  });
  return {
    invoked: true,
    command,
    exitCode: result.status,
    outputTail: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-4000),
  };
}

function runGates(task) {
  const result = spawnSync('bash', [path.join(CODE_ROOT, 'scripts', 'gates.sh')], {
    cwd: CODE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, TASK_ID: task.id, TASK_ACCEPTANCE: task.acceptance ?? '' },
  });
  return {
    exitCode: result.status,
    transcript: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function runExternalReviewer(task, evidence, evidencePath) {
  const command = process.env.HARNESS_REVIEWER_CMD;
  const result = spawnSync('bash', ['-c', command], {
    cwd: CODE_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(evidence, null, 2),
    env: { ...process.env, TASK_ID: task.id, EVIDENCE_PATH: evidencePath },
  });
  try {
    const verdict = JSON.parse((result.stdout ?? '').trim());
    if (!['accept', 'reject'].includes(verdict.verdict)) throw new Error('bad verdict');
    return { verdict: verdict.verdict, reasons: verdict.reasons ?? [], reviewer: 'external' };
  } catch {
    return {
      verdict: 'reject',
      reasons: [`external reviewer produced no valid verdict (exit ${result.status})`],
      reviewer: 'external',
    };
  }
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

let completed = 0;

for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
  let state;
  try {
    state = loadState();
  } catch (err) {
    console.error(`HALT ${err.message}`);
    process.exit(1);
  }

  const selection = selectNext(state);

  if (selection.kind === 'awaiting_approval') {
    log(`AWAITING_APPROVAL ${selection.task.id}: ${selection.task.title}`);
    log('Human approval required. Nothing else runs until that status changes.');
    process.exit(0);
  }
  if (selection.kind === 'blocked') {
    log(`BLOCKED_AT ${selection.task.id}: ${selection.task.blockedReason ?? 'blocked'}`);
    if (selection.stranded?.length) log(`stranded: ${selection.stranded.join(', ')}`);
    process.exit(1);
  }
  if (selection.kind === 'none') {
    log('ALL_AUTHORIZED_TASKS_DONE');
    process.exit(0);
  }

  const task = findTask(state, selection.task.id);
  const maxAttempts = state.maxRepairAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (selection.kind === 'resume') {
    log(`RESUME ${task.id}: ${task.title} (attempt ${task.attempts ?? 0}/${maxAttempts})`);
    appendJournal(
      `### ${task.id} — resumed after interruption\n- status: in_progress (gates re-run; nothing assumed\n- previous evidence retained\n`,
    );
  } else {
    task.status = 'in_progress';
    task.startedAt = task.startedAt ?? nowIso();
    saveState(state);
    appendJournal(
      [
        `## ${task.id} — ${task.title}`,
        `- milestone: ${task.milestone ?? 'unassigned'}`,
        `- acceptance: \`${task.acceptance ?? '(none)'}\``,
        `- scope: ${(task.scope ?? []).join(', ') || '(none)'}`,
        '- status: in_progress',
      ].join('\n'),
    );
    log(`START ${task.id}: ${task.title}`);
  }

  const runId = newRunId();
  const startedAt = nowIso();
  const implementer = runImplementer(task);
  const changed = changedFiles();
  const gate = runGates(task);

  const implementerFailed = implementer.invoked === true && implementer.exitCode !== 0;
  const gateFailed = gate.exitCode !== 0 || implementerFailed;

  const evidence = {
    runId,
    taskId: task.id,
    milestone: task.milestone ?? null,
    attempt: (task.attempts ?? 0) + 1,
    startedAt,
    finishedAt: nowIso(),
    implementer,
    gate: implementerFailed
      ? { ...gate, exitCode: 1, transcript: `${gate.transcript}[loop] implementer exited ${implementer.exitCode}\n` }
      : gate,
    taskAcceptance: task.acceptance ?? '',
    scope: task.scope ?? [],
    changedFiles: changed.files,
    gitTracked: changed.gitTracked,
  };

  if (gateFailed) {
    task.attempts = (task.attempts ?? 0) + 1;
    evidence.outcome = 'gate-failed';
    const evidencePath = writeEvidence(task.id, evidence);
    task.evidence = [...(task.evidence ?? []), evidencePath];

    if (task.attempts >= maxAttempts) {
      task.status = 'blocked';
      task.blockedReason = `gates failed after ${task.attempts} attempt(s)`;
      saveState(state);
      appendJournal(
        `- status: **blocked** (${task.blockedReason})\n- evidence: \`${path.relative(CODE_ROOT, evidencePath)}\`\n- escalation: repair budget exhausted; human decision required\n`,
      );
      console.error(`BLOCKED ${task.id}: ${task.blockedReason}`);
      console.error(gate.transcript.slice(-2000));
      process.exit(1);
    }

    saveState(state);
    appendJournal(
      `- attempt ${task.attempts} failed gates; ${maxAttempts - task.attempts} repair attempt(s) left\n- evidence: \`${path.relative(CODE_ROOT, evidencePath)}\`\n`,
    );
    log(`RETRY ${task.id} (attempt ${task.attempts}/${maxAttempts} failed)`);
    continue;
  }

  // Review is a separate step with separate inputs: it never sees the
  // implementer's conversation, only the recorded evidence.
  const probePath = writeEvidence(task.id, { ...evidence, outcome: 'awaiting-review' });
  const review = process.env.HARNESS_REVIEWER_CMD
    ? runExternalReviewer(task, evidence, probePath)
    : reviewEvidence({
        task,
        evidence,
        maxAttempts,
        hasJournal: journalHasTask(task.id),
      });

  evidence.review = review;
  evidence.outcome = review.verdict === 'accept' ? 'accepted' : 'review-rejected';
  const evidencePath = writeEvidence(task.id, evidence);
  task.evidence = [...(task.evidence ?? []), evidencePath];

  if (review.verdict === 'accept') {
    task.status = 'done';
    task.completedAt = nowIso();
    saveState(state);
    appendJournal(
      `- gates: PASS\n- reviewer: accept\n- status: **done**\n- evidence: \`${path.relative(CODE_ROOT, evidencePath)}\`\n`,
    );
    log(`DONE ${task.id}`);
    completed += 1;

    if (process.env.HARNESS_CRASH_AFTER && Number(process.env.HARNESS_CRASH_AFTER) === completed) {
      log('[harness] simulating hard kill (SIGKILL) — state must survive');
      process.kill(process.pid, 'SIGKILL');
    }
    continue;
  }

  task.attempts = (task.attempts ?? 0) + 1;
  if (task.attempts >= maxAttempts) {
    task.status = 'blocked';
    task.blockedReason = `review rejected after ${task.attempts} attempt(s): ${review.reasons.join('; ')}`;
    saveState(state);
    appendJournal(
      `- gates: PASS\n- reviewer: **reject** (${review.reasons.join('; ')})\n- status: **blocked**\n- evidence: \`${path.relative(CODE_ROOT, evidencePath)}\`\n`,
    );
    console.error(`BLOCKED ${task.id}: review rejected`);
    console.error(review.reasons.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }

  saveState(state);
  appendJournal(
    `- gates: PASS\n- reviewer: **reject** (${review.reasons.join('; ')})\n- attempt ${task.attempts} counted; ${maxAttempts - task.attempts} left\n`,
  );
  log(`RETRY ${task.id}: review rejected (${review.reasons.join('; ')})`);
}

console.error(`HALT iteration bound reached (${MAX_ITERATIONS})`);
process.exit(1);
