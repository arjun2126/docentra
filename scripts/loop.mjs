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
import { createHash } from 'node:crypto';
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
import { extractVerdict } from './lib/verdict.mjs';

const MAX_ITERATIONS = Number(process.env.HARNESS_MAX_ITERATIONS ?? 25);
const MAX_REVIEWER_RETRIES = Number(process.env.HARNESS_REVIEWER_RETRIES ?? 1);
// Every external call is bounded. A nonresponsive agent must cost one timeout,
// never an unattended wait with no evidence and no exit.
const IMPLEMENTER_TIMEOUT_MS = Number(process.env.HARNESS_IMPLEMENTER_TIMEOUT_MS ?? 600_000);
const REVIEWER_TIMEOUT_MS = Number(process.env.HARNESS_REVIEWER_TIMEOUT_MS ?? 180_000);

// Harness-owned paths never count as implementation changes.
const HARNESS_OWNED = ['tasks/', 'journal/', '.harness-tmp/'];

function gitToplevel(dir) {
  const probe = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) return null;
  try {
    return fs.realpathSync(probe.stdout.trim());
  } catch {
    return null;
  }
}

// Tasks may declare a working directory (an isolated fixture or sandbox).
// Default is the repository root, so existing tasks are unaffected.
function taskWorkdir(task) {
  if (!task?.workdir) return CODE_ROOT;
  return path.isAbsolute(task.workdir) ? task.workdir : path.resolve(CODE_ROOT, task.workdir);
}

// Changed files are measured in the task's own workdir. A nested fixture must
// not borrow the parent repository's tree, so git has to own that root itself
// (rev-parse toplevel === workdir).
function changedFiles(task) {
  const root = taskWorkdir(task);
  const top = gitToplevel(root);
  if (!top || top !== fs.realpathSync(root)) return { gitTracked: false, files: [] };
  const result = spawnSync('git', ['-C', root, 'status', '--porcelain'], {
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

/**
 * Fingerprint of the task's working tree (HEAD + uncommitted changes). Used to
 * resume an interrupted task without re-spending tokens on an implementer call
 * when nothing has changed since the last passing gate.
 */
function gitHead(task) {
  const result = spawnSync('git', ['-C', taskWorkdir(task), 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Everything the task changed, committed or not, against the base it started
 * from. Recorded in evidence so an independent reviewer can judge work that was
 * already committed, instead of only the uncommitted remainder.
 */
function diffSince(task, base) {
  const result = spawnSync('git', ['-C', taskWorkdir(task), 'diff', base ?? 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) return '';
  return (result.stdout ?? '').slice(0, 8000);
}

function treeState(task) {
  const root = taskWorkdir(task);
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (head.status !== 0) return null;
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  return createHash('sha256')
    .update(`${head.stdout.trim()}\n${status.stdout ?? ''}`)
    .digest('hex');
}

function resumedWithExistingWork(task, kind) {
  if (kind !== 'resume') return null;
  const last = (task.evidence ?? []).at(-1);
  if (!last) return null;
  try {
    const prior = JSON.parse(fs.readFileSync(last, 'utf8'));
    if (prior?.gate?.exitCode !== 0) return null;
    const current = treeState(task);
    if (!current || !prior.treeState || current !== prior.treeState) return null;
    return prior.runId;
  } catch {
    return null;
  }
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
  const workdir = taskWorkdir(task);
  const brief = [
    `Task ${task.id}: ${task.title}`,
    '',
    task.brief ?? '(no additional brief)',
    '',
    // A retry that does not say what failed invites the same mistake again and
    // burns another attempt (and another model call).
    task.attempts > 0 && task.lastFailure
      ? `Previous attempt failed — fix the cause, do not bypass the gate:\n${task.lastFailure}\n`
      : '',
    `Working directory: ${workdir}`,
    `Scope: ${(task.scope ?? []).join(', ') || '(none declared)'}`,
    `Acceptance: ${task.acceptance ?? '(none)'}`,
  ].join('\n');

  const result = spawnSync('bash', ['-c', command], {
    cwd: workdir,
    encoding: 'utf8',
    input: brief,
    timeout: IMPLEMENTER_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      TASK_ID: task.id,
      TASK_TITLE: task.title,
      TASK_SCOPE: (task.scope ?? []).join(','),
      TASK_ACCEPTANCE: task.acceptance ?? '',
      TASK_BRIEF: brief,
      HARNESS_WORKDIR: workdir,
    },
  });
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL';
  return {
    invoked: true,
    command,
    exitCode: result.status ?? (timedOut ? 124 : 1),
    timedOut,
    reason: timedOut
      ? `implementer did not finish within ${IMPLEMENTER_TIMEOUT_MS}ms and was killed`
      : undefined,
    outputTail: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-4000),
  };
}

function runGates(task) {
  const result = spawnSync('bash', [path.join(CODE_ROOT, 'scripts', 'gates.sh')], {
    cwd: CODE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      TASK_ID: task.id,
      TASK_ACCEPTANCE: task.acceptance ?? '',
      HARNESS_ACCEPTANCE_CWD: taskWorkdir(task),
    },
  });
  return {
    exitCode: result.status,
    transcript: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function runExternalReviewer(task, evidence, evidencePath) {
  const command = process.env.HARNESS_REVIEWER_CMD;
  const result = spawnSync('bash', ['-c', command], {
    cwd: taskWorkdir(task),
    encoding: 'utf8',
    input: JSON.stringify(evidence, null, 2),
    timeout: REVIEWER_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      TASK_ID: task.id,
      EVIDENCE_PATH: evidencePath,
      HARNESS_WORKDIR: taskWorkdir(task),
    },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const verdict = extractVerdict(stdout) ?? extractVerdict(stderr);
  if (verdict && ['accept', 'reject'].includes(verdict.verdict)) {
    return {
      verdict: verdict.verdict,
      reasons: verdict.reasons ?? [],
      reviewer: 'external',
      rawTail: stdout.slice(-1500),
    };
  }
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL';
  return {
    verdict: 'reject',
    unavailable: true,
    reasons: [
      timedOut
        ? `external reviewer timed out after ${REVIEWER_TIMEOUT_MS}ms`
        : `external reviewer produced no valid verdict (exit ${result.status})`,
    ],
    reviewer: 'external',
    rawTail: `${stdout}${stderr}`.slice(-1500),
  };
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
    // Base commit for this task's diff, so review sees committed work too.
    task.baseHead = task.baseHead ?? gitHead(task);
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
  // Resuming an interrupted task whose tree still satisfies the last passing
  // gate must not pay for another implementer run.
  const alreadyDone = resumedWithExistingWork(task, selection.kind);
  const implementer = alreadyDone
    ? {
        invoked: false,
        resumed: true,
        reason: `resumed: worktree unchanged since passing gate (${alreadyDone})`,
      }
    : runImplementer(task);
  const changed = changedFiles(task);
  const tree = treeState(task);
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
    workdir: taskWorkdir(task),
    treeState: tree,
    baseHead: task.baseHead ?? null,
    diff: diffSince(task, task.baseHead),
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

    task.lastFailure = `gates failed (exit ${gate.exitCode}); acceptance \`${task.acceptance ?? '(none)'}\` did not pass. Transcript tail: ${gate.transcript.slice(-800)}`;
    saveState(state);
    appendJournal(
      `- attempt ${task.attempts} failed gates; ${maxAttempts - task.attempts} repair attempt(s) left\n- evidence: \`${path.relative(CODE_ROOT, evidencePath)}\`\n`,
    );
    log(`RETRY ${task.id} (attempt ${task.attempts}/${maxAttempts} failed)`);
    continue;
  }

  // Review is a separate step with separate inputs: it never sees the
  // implementer's conversation, only the recorded evidence.
  let review;
  if (process.env.HARNESS_REVIEWER_CMD) {
    const probePath = writeEvidence(task.id, { ...evidence, outcome: 'awaiting-review' });
    review = runExternalReviewer(task, evidence, probePath);
    // No verdict is an infrastructure failure, not a judgement. Retry boundedly
    // so a model quota error cannot block work whose gates actually passed.
    let reviewerRetries = 0;
    while (review.unavailable === true && reviewerRetries < MAX_REVIEWER_RETRIES) {
      reviewerRetries += 1;
      log('REVIEW_RETRY ' + task.id + ' (no verdict; retry ' + reviewerRetries + '/' + MAX_REVIEWER_RETRIES + ')');
      review = runExternalReviewer(task, evidence, probePath);
    }
    review.reviewerRetries = reviewerRetries;
  } else {
    review = reviewEvidence({
      task,
      evidence,
      maxAttempts,
      hasJournal: journalHasTask(task.id),
    });
  }

  evidence.review = review;
  evidence.outcome = review.verdict === 'accept' ? 'accepted' : 'review-rejected';
  const evidencePath = writeEvidence(task.id, evidence);
  task.evidence = [...(task.evidence ?? []), evidencePath];

  if (review.verdict === 'accept') {
    if (process.env.HARNESS_CRASH_TASK === task.id) {
      // Persist the evidence pointer first: after a crash the resume path must
      // be able to see the passing gate and skip re-paying for the implementer.
      saveState(state);
      log(`[harness] simulating hard kill during ${task.id}, before completion is recorded`);
      process.kill(process.pid, 'SIGKILL');
    }
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
  task.lastFailure = `review rejected: ${review.reasons.join('; ')}`;
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
