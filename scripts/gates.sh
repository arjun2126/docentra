#!/usr/bin/env bash
# The single definition of "green" for this repository.
#
# Agents and CI both call this script, so a check that passes for an agent but
# fails in CI (or vice versa) is impossible by construction.
#
# Usage:
#   bash scripts/gates.sh                      # universal gates only
#   TASK_ACCEPTANCE='npm test' bash scripts/gates.sh   # + one task's acceptance
#   HARNESS_ROOT=/tmp/x TASK_ACCEPTANCE=... bash scripts/gates.sh
#
# Exit 0 = every gate passed. Any non-zero = blocked; never bypass.
set -uo pipefail

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_ROOT="${HARNESS_ROOT:-$CODE_ROOT}"
STATE_FILE="${HARNESS_STATE_DIR:-$DATA_ROOT/tasks}/state.json"

failures=0

pass() { printf '[gate] %-12s PASS  %s\n' "$1" "$2"; }
fail() { printf '[gate] %-12s FAIL  %s\n' "$1" "$2"; failures=$((failures + 1)); }

# G0 — harness configuration is present.
gate_g0() {
  local missing=()
  for f in AGENTS.md PLANS.md scripts/gates.sh scripts/loop.mjs scripts/next-task.mjs; do
    [[ -f "$CODE_ROOT/$f" ]] || missing+=("$f")
  done
  [[ -d "$DATA_ROOT/journal" ]] || missing+=("journal/")
  [[ -d "$(dirname "$STATE_FILE")" ]] || missing+=("tasks/")
  if ((${#missing[@]})); then
    echo "  missing: ${missing[*]}"
    return 1
  fi
}

# G1 — task state parses and satisfies the schema.
gate_g1() {
  node "$CODE_ROOT/scripts/validate-state.mjs" "$STATE_FILE"
}

# G2 — every shell script is syntactically valid.
gate_g2() {
  local bad=0 f
  while IFS= read -r f; do
    if ! bash -n "$f"; then
      echo "  syntax error: ${f#"$CODE_ROOT"/}"
      bad=1
    fi
  done < <(find "$CODE_ROOT/scripts" -name '*.sh' -type f)
  return "$bad"
}

# G3 — harness unit tests.
gate_g3() {
  node --test "$CODE_ROOT"/scripts/tests/*.test.mjs
}

echo "== gates =="
echo "   code:  $CODE_ROOT"
echo "   data:  $DATA_ROOT"

gate_g0 && pass G0 "harness files present" || fail G0 "harness files missing"
gate_g1 && pass G1 "task state valid" || fail G1 "task state invalid"
gate_g2 && pass G2 "shell syntax" || fail G2 "shell syntax errors"
gate_g3 && pass G3 "harness unit tests" || fail G3 "harness unit tests failed"

# Task acceptance — the task's own definition of done.
if [[ -n "${TASK_ACCEPTANCE:-}" ]]; then
  echo "-- task acceptance (${TASK_ID:-unknown}) --"
  echo "   \$ $TASK_ACCEPTANCE"
  if ( cd "$CODE_ROOT" && bash -c "$TASK_ACCEPTANCE" ); then
    pass ACCEPT "task acceptance command"
  else
    fail ACCEPT "task acceptance command failed"
  fi
else
  echo "[gate] ACCEPT       SKIP  no TASK_ACCEPTANCE set"
fi

echo "== summary =="
if ((failures > 0)); then
  echo "GATES: FAIL ($failures)"
  exit 1
fi
echo "GATES: PASS"
exit 0
