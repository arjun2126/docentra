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
