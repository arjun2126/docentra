#!/usr/bin/env bash
# Run the workflow loop for M1 with real agents.
#
#   bash scripts/m1-run.sh                 # next authorized task, then continue
#   M1_MODEL_IMPL=... M1_MODEL_REVIEW=... bash scripts/m1-run.sh
#
# Models are separate per role: free tiers meter requests per model, so one
# allowance must not starve the other. Override without editing this file.
set -uo pipefail

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_IMPL="${M1_MODEL_IMPL:-opencode/mimo-v2.6-flash-free}"
MODEL_REVIEW="${M1_MODEL_REVIEW:-opencode/nemotron-3.5-lightning-free}"
IMPL_TIMEOUT="${IMPL_TIMEOUT:-900}"
REVIEW_TIMEOUT="${REVIEW_TIMEOUT:-300}"

cd "$CODE_ROOT"

# The command strings are evaluated by the loop (bash -c), so $TASK_* expands
# there. $CODE_ROOT is baked in because the loop may run in another directory.
HARNESS_IMPLEMENTER_CMD="timeout $IMPL_TIMEOUT opencode run --standalone --model $MODEL_IMPL --agent implementer --auto --title \"impl \$TASK_ID\" \"\$TASK_BRIEF\""
HARNESS_REVIEWER_CMD="timeout $REVIEW_TIMEOUT opencode run --standalone --model $MODEL_REVIEW --agent reviewer --auto --title \"review \$TASK_ID\" \"\$(node $CODE_ROOT/scripts/review-payload.mjs)\""
export HARNESS_IMPLEMENTER_CMD HARNESS_REVIEWER_CMD
export HARNESS_MAX_ITERATIONS="${HARNESS_MAX_ITERATIONS:-8}"

echo "implementer: $MODEL_IMPL"
echo "reviewer:    $MODEL_REVIEW"
exec node scripts/loop.mjs
