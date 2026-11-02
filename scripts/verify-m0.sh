#!/usr/bin/env bash
# M0 acceptance: prove the harness itself behaves correctly.
#
# Five scenarios, each in an isolated HARNESS_ROOT so the real task register is
# never touched:
#   S1 synthetic tasks execute end to end
#   S2 a hard kill mid-run resumes without repeating completed work
#   S3 a deliberately failing acceptance blocks progress, bounded to 2 attempts
#   S4 the independent reviewer can reject, and rejection blocks progress
#   S5 an approval gate halts the loop cleanly and runs nothing behind it
#
# Exit 0 only if every scenario behaves as specified.
set -uo pipefail

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$CODE_ROOT/.harness-tmp"
REPORT_DIR="$CODE_ROOT/tasks/evidence/M0-VERIFY"
RESULTS="$SCRATCH/results.txt"

rm -rf "$SCRATCH"
mkdir -p "$SCRATCH" "$REPORT_DIR" "$CODE_ROOT/journal"
: > "$RESULTS"

failures=0
record() { # name passed detail
  local name="$1" passed="$2" detail="$3"
  printf '%s|%s|%s\n' "$name" "$passed" "$detail" >> "$RESULTS"
  if [[ "$passed" == "1" ]]; then
    printf '  PASS  %-4s %s\n' "$name" "$detail"
  else
    printf '  FAIL  %-4s %s\n' "$name" "$detail"
    failures=$((failures + 1))
  fi
}

seed() { # dir json
  mkdir -p "$1/tasks" "$1/journal"
  printf '%s\n' "$2" > "$1/tasks/state.json"
}

run_loop() { # dir [KEY=VAL ...]
  local dir="$1"; shift
  ( cd "$CODE_ROOT" && env HARNESS_ROOT="$dir" HARNESS_STATE_DIR="$dir/tasks" \
      HARNESS_MAX_ITERATIONS=10 "$@" node scripts/loop.mjs )
}

field() { # dir taskId field
  node -e 'const s=require(process.argv[1]);const t=s.tasks.find(x=>x.id===process.argv[2]);process.stdout.write(t?(t[process.argv[3]]===undefined?"undefined":String(t[process.argv[3]])):"MISSING")' \
    "$1/tasks/state.json" "$2" "$3"
}

evcount() { ls "$1/tasks/evidence/$2" 2>/dev/null | wc -l | tr -d ' '; }

echo "== M0 harness verification =="
echo "   code: $CODE_ROOT"

# ---------------------------------------------------------------- S1: happy path
echo "S1 synthetic workflow executes end to end"
S1="$SCRATCH/s1"
seed "$S1" '{"schemaVersion":1,"maxRepairAttempts":2,"tasks":[
 {"id":"S1-T1","title":"first",'"$PASS_TASK"'},
 {"id":"S1-T2","title":"second","dependsOn":["S1-T1"],'"${PASS_TASK#*\{}"},
 {"id":"S1-T3","title":"third","dependsOn":["S1-T2"],'"${PASS_TASK#*\{}"}]}'
run_loop "$S1" > "$S1/run.log" 2>&1
rc=$?
s1_ok=1; s1_detail="exit=$rc"
[[ "$rc" -eq 0 ]] || { s1_ok=0; s1_detail+=" expected exit 0"; }
for id in S1-T1 S1-T2 S1-T3; do
  st="$(field "$S1" "$id" status)"
  [[ "$st" == "done" ]] || { s1_ok=0; s1_detail+=" $id=$st"; }
done
[[ "$(evcount "$S1" S1-T1)" == "1" ]] || { s1_ok=0; s1_detail+=" T1 evidence=$(evcount "$S1" S1-T1)"; }
ls "$S1/journal"/*.md > /dev/null 2>&1 || { s1_ok=0; s1_detail+=" no journal"; }
record S1 "$s1_ok" "$s1_detail"

# --------------------------------------------------------------- S2: kill/resume
echo "S2 interrupted execution resumes without repeating completed work"
S2="$SCRATCH/s2"
seed "$S2" '{"schemaVersion":1,"maxRepairAttempts":2,"tasks":[
 {"id":"S2-T1","title":"first",'"$PASS_TASK"'},
 {"id":"S2-T2","title":"second","dependsOn":["S2-T1"],'"${PASS_TASK#*\{}'},
 {"id":"S2-T3","title":"third","dependsOn":["S2-T2"],'"${PASS_TASK#*\{}"}]}'
run_loop "$S2" HARNESS_CRASH_AFTER=1 > "$S2/crash.log" 2>&1
crash_rc=$?
pre_t1="$(field "$S2" S2-T1 status)"
pre_t2="$(field "$S2" S2-T2 status)"
pre_ev="$(evcount "$S2" S2-T1)"
run_loop "$S2" > "$S2/resume.log" 2>&1
resume_rc=$?
s2_ok=1; s2_detail="crash_exit=$crash_rc resume_exit=$resume_rc"
[[ "$crash_rc" -ne 0 ]] || { s2_ok=0; s2_detail+=" crash did not terminate run"; }
[[ "$pre_t1" == "done" ]] || { s2_ok=0; s2_detail+=" pre-crash T1=$pre_t1"; }
[[ "$pre_t2" == "pending" ]] || { s2_ok=0; s2_detail+=" pre-crash T2=$pre_t2"; }
[[ "$resume_rc" -eq 0 ]] || { s2_ok=0; s2_detail+=" resume failed"; }
for id in S2-T1 S2-T2 S2-T3; do
  st="$(field "$S2" "$id" status)"
  [[ "$st" == "done" ]] || { s2_ok=0; s2_detail+=" $id=$st after resume"; }
done
[[ "$(evcount "$S2" S2-T1)" == "$pre_ev" ]] || { s2_ok=0; s2_detail+=" T1 evidence re-created ($pre_ev -> $(evcount "$S2" S2-T1))"; }
[[ "$(field "$S2" S2-T1 attempts)" == "0" ]] || { s2_ok=0; s2_detail+=" T1 attempts changed"; }
grep -q 'RESUME' "$S2/resume.log" || { s2_ok=0; s2_detail+=" no resume was logged"; }
record S2 "$s2_ok" "$s2_detail"

# ------------------------------------------------------------ S3: failing gate
echo "S3 a failing acceptance blocks progress with bounded retries"
S3="$SCRATCH/s3"
seed "$S3" '{"schemaVersion":1,"maxRepairAttempts":2,"tasks":[
 {"id":"S3-T1","title":"deliberately broken","status":"pending","attempts":0,"dependsOn":[],"scope":["harness/"],"synthetic":true,"acceptance":"node harness/fixtures/fail.mjs"},
 {"id":"S3-T2","title":"dependent","status":"pending","attempts":0,"dependsOn":["S3-T1"],"scope":["harness/"],"synthetic":true,"acceptance":"node harness/fixtures/pass.mjs"}]}'
run_loop "$S3" > "$S3/run.log" 2>&1
s3_rc=$?
s3_ok=1; s3_detail="exit=$s3_rc"
[[ "$s3_rc" -eq 1 ]] || { s3_ok=0; s3_detail+=" expected exit 1"; }
[[ "$(field "$S3" S3-T1 status)" == "blocked" ]] || { s3_ok=0; s3_detail+=" T1=$(field "$S3" S3-T1 status)"; }
[[ "$(field "$S3" S3-T1 attempts)" == "2" ]] || { s3_ok=0; s3_detail+=" attempts=$(field "$S3" S3-T1 attempts)"; }
[[ "$(field "$S3" S3-T2 status)" == "pending" ]] || { s3_ok=0; s3_detail+=" dependent ran: $(field "$S3" S3-T2 status)"; }
[[ "$(evcount "$S3" S3-T1)" == "2" ]] || { s3_ok=0; s3_detail+=" evidence=$(evcount "$S3" S3-T1)"; }
grep -q 'GATES: FAIL' "$S3"/tasks/evidence/S3-T1/*.json || { s3_ok=0; s3_detail+=" failure not evidenced"; }
record S3 "$s3_ok" "$s3_detail"

# --------------------------------------------------------- S4: reviewer rejects
echo "S4 the independent reviewer can reject, and rejection blocks progress"
S4="$SCRATCH/s4"
seed "$S4" '{"schemaVersion":1,"maxRepairAttempts":2,"tasks":[
 {"id":"S4-T1","title":"passing gates but unbounded scope","status":"pending","attempts":0,"dependsOn":[],"scope":[],"synthetic":true,"acceptance":"node harness/fixtures/pass.mjs"}]}'
run_loop "$S4" > "$S4/run.log" 2>&1
s4_rc=$?
s4_ok=1; s4_detail="exit=$s4_rc"
[[ "$s4_rc" -eq 1 ]] || { s4_ok=0; s4_detail+=" expected exit 1"; }
[[ "$(field "$S4" S4-T1 status)" == "blocked" ]] || { s4_ok=0; s4_detail+=" status=$(field "$S4" S4-T1 status)"; }
grep -rq 'scope is empty' "$S4/tasks/evidence/S4-T1" || { s4_ok=0; s4_detail+=" no rejection reason recorded"; }
grep -q 'GATES: PASS' "$S4"/tasks/evidence/S4-T1/*.json || { s4_ok=0; s4_detail+=" gates did not actually pass"; }
record S4 "$s4_ok" "$s4_detail"

# ------------------------------------------------------------ S5: approval gate
echo "S5 an approval gate halts the loop without running dependent work"
S5="$SCRATCH/s5"
seed "$S5" '{"schemaVersion":1,"maxRepairAttempts":2,"tasks":[
 {"id":"S5-GATE","title":"human approval required","status":"awaiting_approval","attempts":0,"dependsOn":[]},
 {"id":"S5-T1","title":"product work","status":"pending","attempts":0,"dependsOn":["S5-GATE"],"scope":["app/"],"synthetic":true,"acceptance":"node harness/fixtures/pass.mjs"}]}'
run_loop "$S5" > "$S5/run.log" 2>&1
s5_rc=$?
s5_ok=1; s5_detail="exit=$s5_rc"
[[ "$s5_rc" -eq 0 ]] || { s5_ok=0; s5_detail+=" approval stop should exit 0"; }
grep -q 'AWAITING_APPROVAL' "$S5/run.log" || { s5_ok=0; s5_detail+=" gate not reported"; }
[[ "$(field "$S5" S5-T1 status)" == "pending" ]] || { s5_ok=0; s5_detail+=" dependent ran: $(field "$S5" S5-T1 status)"; }
[[ "$(evcount "$S5" S5-T1)" == "0" ]] || { s5_ok=0; s5_detail+=" dependent produced evidence"; }
record S5 "$s5_ok" "$s5_detail"

# -------------------------------------------------------------------- summary
node - "$RESULTS" "$REPORT_DIR/summary.json" "$failures" <<'NODE'
const fs = require('fs');
const [resultsPath, outPath, failures] = process.argv.slice(2);
const scenarios = fs.readFileSync(resultsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => {
  const [name, passed, detail] = line.split('|');
  return { name, passed: passed === '1', detail };
});
const summary = {
  stage: 'M0',
  generatedAt: new Date().toISOString(),
  node: process.version,
  failures: Number(failures),
  scenarios,
};
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nscenarios: ${scenarios.length}, failures: ${summary.failures}`);
NODE

{
  echo "## M0-VERIFY — harness verification"
  echo "- result: $( ((failures == 0)) && echo 'all scenarios passed' || echo "$failures scenario(s) failed" )"
  echo "- summary: \`tasks/evidence/M0-VERIFY/summary.json\`"
  while IFS='|' read -r name passed detail; do
    [[ -n "$name" ]] || continue
    echo "  - $name: $([[ "$passed" == "1" ]] && echo PASS || echo FAIL) — $detail"
  done < "$RESULTS"
  echo
} >> "$CODE_ROOT/journal/$(date -u +%F).md"

if ((failures > 0)); then
  echo "M0: FAIL ($failures)"
  exit 1
fi
echo "M0: PASS"
exit 0
