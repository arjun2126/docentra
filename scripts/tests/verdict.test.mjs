import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVerdict } from '../lib/verdict.mjs';

test('parses a bare verdict object', () => {
  const verdict = extractVerdict('{"verdict":"accept","reasons":[]}');
  assert.equal(verdict.verdict, 'accept');
});

test('parses a verdict wrapped in model chatter and ANSI noise', () => {
  const text = [
    '> reviewer · some-model',
    '\u001b[0mHere is my judgement.',
    '```json',
    '{"verdict":"reject","reasons":["uses toFixed on money"]}',
    '```',
    'Hope that helps.',
  ].join('\n');
  const verdict = extractVerdict(text);
  assert.equal(verdict.verdict, 'reject');
  assert.deepEqual(verdict.reasons, ['uses toFixed on money']);
});

test('survives braces and escaped quotes inside the reasons', () => {
  const text = 'note {"verdict":"reject","reasons":["scope {src/} violated \\"badly\\""]} trailing';
  const verdict = extractVerdict(text);
  assert.equal(verdict.verdict, 'reject');
  assert.match(verdict.reasons[0], /badly/);
});

test('returns null when no verdict is present', () => {
  assert.equal(extractVerdict('Error: Free usage limit reached.'), null);
  assert.equal(extractVerdict(''), null);
});

test('returns null when the object is malformed', () => {
  assert.equal(extractVerdict('{"verdict":"accept",'), null);
});

test('recovers the decision from JSON broken by a stray escape', () => {
  // Seen in practice: an escaped quote inside a reason made the object invalid,
  // and the run was recorded as a rejection the reviewer never gave.
  // Unescaped quote inside a reason: invalid JSON, unambiguous decision.
  const text = '{"verdict":"accept","reasons":["bad "quote"]}';
  const verdict = extractVerdict(text);
  assert.equal(verdict.verdict, 'accept');
  assert.equal(verdict.recovered, true);
});
