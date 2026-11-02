#!/usr/bin/env bash
# Build an isolated fixture repository for M0.5 (real agent integration).
#
# The fixture is a tiny Node project with a genuine bug and an explicit money
# policy. It exists so a real implementer can be given real work without any
# Docentra product code existing yet.
#
#   bash scripts/m05-fixture.sh [target-dir]
#
# The fixture is scratch space (gitignored); regenerate at any time.
set -euo pipefail

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="${1:-$CODE_ROOT/.harness-tmp/m05-fixture}"

rm -rf "$FIXTURE"
mkdir -p "$FIXTURE/src" "$FIXTURE/test" "$FIXTURE/tasks" "$FIXTURE/journal"

cat > "$FIXTURE/package.json" <<'JSON'
{
  "name": "docentra-m05-fixture",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
JSON

cat > "$FIXTURE/POLICY.md" <<'MD'
# Money policy (fixture)

This repository handles monetary amounts. The rules are not stylistic; they are
the reason the tests exist.

1. Currency values are never accumulated in binary floating point. Sums must be
   computed in integer minor units (cents), then converted back once.
2. The only permitted float -> cents conversion is a single explicit rounding at
   the boundary (`Math.round(amount * 100)`), and it must be visible and named.
3. `toFixed` must never be used on a monetary value: it rounds a float that has
   already lost precision.
4. No currency symbol, currency code or locale-specific formatting is introduced.
   Amounts are plain numbers.
5. Every exported function has a test that covers a rounding edge case.
MD

cat > "$FIXTURE/src/money.mjs" <<'JS'
// Monetary helpers.
//
// KNOWN DEFECT: amounts are accumulated in binary floating point, so sums drift
// (0.1 + 0.2 !== 0.3) and half-cent rounding is unreliable.

/** Round a monetary amount to 2 decimal places. */
export function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

/** Sum monetary amounts. */
export function sumAmounts(amounts) {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
  }
  return total;
}
JS

cat > "$FIXTURE/test/money.test.mjs" <<'JS'
import test from 'node:test';
import assert from 'node:assert/strict';
import { roundMoney, sumAmounts } from '../src/money.mjs';

test('roundMoney rounds half up', () => {
  assert.equal(roundMoney(2.005), 2.01);
  assert.equal(roundMoney(-2.005), -2.01);
});

test('roundMoney leaves exact amounts untouched', () => {
  assert.equal(roundMoney(10), 10);
  assert.equal(roundMoney(10.5), 10.5);
});

test('sumAmounts preserves exact cents', () => {
  assert.equal(sumAmounts([0.1, 0.2]), 0.3);
  assert.equal(sumAmounts([19.99, 0.01]), 20);
});

test('sumAmounts handles an empty list', () => {
  assert.equal(sumAmounts([]), 0);
});
JS

# Agent definitions are resolved from the project directory, so the fixture gets
# its own copy: the fixture must be a self-contained project for OpenCode.
cp -r "$CODE_ROOT/.opencode" "$FIXTURE/.opencode"

cat > "$FIXTURE/AGENTS.md" <<'MD'
# Fixture agent contract

Single-writer implementer, deterministic gates, read-only reviewer. Follow
POLICY.md. The acceptance command is `node --test test/`.
MD

git -C "$FIXTURE" init -q -b main
git -C "$FIXTURE" add -A
git -C "$FIXTURE" -c user.name="Fixture" -c user.email="fixture@local" \
  commit -q -m "chore: seed fixture with a known money defect"

echo "fixture: $FIXTURE"
echo "baseline test status (expected to fail):"
( cd "$FIXTURE" && node --test test/ 2>&1 | tail -12 ) || true
