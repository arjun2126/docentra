#!/usr/bin/env bash
# M0.5 — real agent integration verification.
#
#   bash scripts/verify-m05.sh setup          # isolated fixture + task register
#   bash scripts/verify-m05.sh stats-before   # OpenCode usage baseline
#   bash scripts/verify-m05.sh run [ENV=VAL]  # real implementer + real reviewer
#   bash scripts/verify-m05.sh stats-after
#   bash scripts/verify-m05.sh report         # assertions + summary evidence
#
# Nothing here is Docentra product code: the agent works inside a throwaway
# fixture repository with a genuine defect and an explicit money policy.
set -uo pipefail

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$CODE_ROOT/.harness-tmp/m05-fixture"
REPORT_DIR="$CODE_ROOT/tasks/evidence/M0.5-VERIFY"
# Separate models per role: free allowances are per model, so one role cannot
# starve the other, and a stronger model is not wasted on a mechanical review.
MODEL_IMPL="${M05_MODEL_IMPL:-${M05_MODEL:-opencode/deepseek-v4.1-flash-free}}"
MODEL_REVIEW="${M05_MODEL_REVIEW:-opencode/nemotron-3.5-lightning-free}"
mkdir -p "$REPORT_DIR"

# The loop passes the brief on stdin and in TASK_BRIEF; the command string is
# evaluated by the loop, so $TASK_* is expanded there, not here.
impl_cmd() {
  cat <<EOF
timeout 240 opencode run --standalone --model $MODEL_IMPL --agent implementer --auto --title "impl \$TASK_ID" "\$TASK_BRIEF"
EOF
}

# One request per review: the payload script inlines the recorded evidence, so
# the reviewer never needs a second turn (free tiers meter requests).
review_cmd() {
  cat <<EOF
timeout 180 opencode run --standalone --model $MODEL_REVIEW --agent reviewer --auto --title "review \$TASK_ID" "\$(node "$CODE_ROOT/scripts/m05-review-payload.mjs")"
EOF
}

case "${1:-}" in
setup)
  bash "$CODE_ROOT/scripts/m05-fixture.sh" "$FIXTURE" | tail -4
  node - "$FIXTURE" <<'NODE'
const fs = require('fs');
const path = require('path');
const fixture = process.argv[2];
const state = {
  schemaVersion: 1,
  maxRepairAttempts: 2,
  tasks: [
    {
      id: 'F-T1',
      milestone: 'M0.5',
      title: 'Make the money tests pass while honouring POLICY.md',
      synthetic: false,
      status: 'pending',
      attempts: 0,
      dependsOn: [],
      workdir: fixture,
      scope: ['src/', 'test/'],
      acceptance: 'node --test',
      brief:
        'The tests in this fixture fail. Fix src/money.mjs so they pass, and follow POLICY.md exactly: totals must be computed in integer cents and converted once at the boundary; no float accumulation; no toFixed on money; no currency symbols.',
    },
    {
      id: 'F-T2',
      milestone: 'M0.5',
      title: 'Add toCents and fromCents helpers with a rounding-edge test',
      synthetic: false,
      status: 'pending',
      attempts: 0,
      dependsOn: ['F-T1'],
      workdir: fixture,
      scope: ['src/', 'test/'],
      acceptance: 'node --test',
      brief:
        'Export toCents(amount) and fromCents(cents) from src/money.mjs following POLICY.md, and add a test covering a rounding edge case.',
    },
    {
      id: 'F-T3',
      milestone: 'M0.5',
      title: 'Add formatAmount returning two decimal places',
      synthetic: false,
      status: 'pending',
      attempts: 0,
      dependsOn: ['F-T2'],
      workdir: fixture,
      scope: ['src/', 'test/'],
      acceptance: 'node --test',
      brief:
        'Add an exported formatAmount(amount) that returns the amount as a string with exactly two decimal places, plus a test for it. POLICY.md is binding.',
    },
  ],
};
fs.writeFileSync(path.join(fixture, 'tasks', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
console.log('seeded 2 fixture tasks (F-T1 -> F-T2)');
NODE
  ;;
stats-before | stats-after)
  out="$REPORT_DIR/$1.json"
  opencode stats --json --cost > "$out" 2>/dev/null
  node -e '
    const s = require(process.argv[1]);
    console.log(`${process.argv[2]}: input=${s.tokens.input} output=${s.tokens.output} cost=${s.cost}`);
  ' "$out" "$1"
  ;;
run)
  shift
  ( cd "$CODE_ROOT" && env \
      HARNESS_ROOT="$FIXTURE" \
      HARNESS_STATE_DIR="$FIXTURE/tasks" \
      HARNESS_MAX_ITERATIONS=8 \
      HARNESS_IMPLEMENTER_CMD="$(impl_cmd)" \
      HARNESS_REVIEWER_CMD="$(review_cmd)" \
      "$@" node scripts/loop.mjs )
  ;;
report)
  node - "$FIXTURE" "$REPORT_DIR" "impl=$MODEL_IMPL review=$MODEL_REVIEW" <<'NODE'
const fs = require('fs');
const path = require('path');
const [fixture, reportDir, model] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(fixture, 'tasks', 'state.json'), 'utf8'));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

const evidenceFor = (id) => {
  const dir = path.join(fixture, 'tasks', 'evidence', id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
};

console.log('task  status   attempts  implementer        gate    review');
for (const task of state.tasks) {
  const runs = evidenceFor(task.id);
  const last = runs.at(-1);
  const impl = last?.implementer?.invoked ? `invoked(exit ${last.implementer.exitCode})` : 'skipped';
  const gate = last ? (last.gate.exitCode === 0 ? 'PASS' : 'FAIL') : '-';
  const review = last?.review ? `${last.review.verdict}${last.review.reviewer ? `/${last.review.reviewer}` : ''}` : '-';
  console.log(
    `${task.id.padEnd(5)} ${task.status.padEnd(8)} ${String(task.attempts).padEnd(9)} ${impl.padEnd(18)} ${gate.padEnd(7)} ${review}`,
  );

  check(`${task.id} completed`, task.status === 'done', task.status);
  check(`${task.id} real implementer ran`, runs.some((r) => r.implementer?.invoked === true), 'no implementer invocation recorded');
  check(
    `${task.id} gates passed`,
    runs.some((r) => r.gate?.exitCode === 0 && (r.gate.transcript ?? '').includes('GATES: PASS')),
    'no passing gate transcript',
  );
  const accepted = runs.some((r) => r.review?.verdict === 'accept' && r.review?.reviewer === 'external');
  check(`${task.id} reviewed by external reviewer`, accepted, 'no external accept');
  const rejected = runs.filter((r) => r.review?.verdict === 'reject').length;
  if (rejected) console.log(`      (${rejected} review rejection(s) recorded)`);
}

const commits = require('node:child_process')
  .execSync(`git -C "${fixture}" log --oneline`, { encoding: 'utf8' })
  .trim()
  .split('\n');
check('fixture has commits beyond the seed', commits.length > 1, `${commits.length} commit(s)`);

let usage = null;
const beforePath = path.join(reportDir, 'stats-before.json');
const afterPath = path.join(reportDir, 'stats-after.json');
if (fs.existsSync(beforePath) && fs.existsSync(afterPath)) {
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  usage = {
    model,
    input: after.tokens.input - before.tokens.input,
    output: after.tokens.output - before.tokens.output,
    reasoning: after.tokens.reasoning - before.tokens.reasoning,
    cacheRead: after.tokens.cache.read - before.tokens.cache.read,
    cost: (after.cost ?? 0) - (before.cost ?? 0),
    prompts: after.prompts - before.prompts,
    sessions: after.sessions - before.sessions,
  };
  console.log(`usage: ${JSON.stringify(usage)}`);
} else {
  console.log('usage: unmeasured (stats snapshots missing)');
}

const failed = checks.filter((c) => !c.ok);
const summary = {
  stage: 'M0.5',
  generatedAt: new Date().toISOString(),
  model,
  fixture,
  usage,
  commits,
  tasks: state.tasks.map((t) => ({ id: t.id, status: t.status, attempts: t.attempts })),
  checks,
  failures: failed.length,
};
fs.writeFileSync(path.join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log('\nchecks:');
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
console.log(failed.length === 0 ? '\nM0.5: PASS' : `\nM0.5: FAIL (${failed.length})`);
process.exit(failed.length === 0 ? 0 : 1);
NODE
  ;;
*)
  echo "usage: verify-m05.sh {setup|stats-before|run|stats-after|report}" >&2
  exit 2
  ;;
esac
