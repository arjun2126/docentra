// Build a single-shot reviewer prompt from recorded evidence.
//
// Free model tiers meter requests per model, not just tokens, so a reviewer
// that has to read files first can run out of quota mid-review. Putting the
// evidence inline makes a review cost exactly one request, and keeps the
// reviewer's inputs identical to the recorded evidence (no private context).
import fs from 'node:fs';

const evidencePath = process.env.EVIDENCE_PATH;
if (!evidencePath) {
  console.error('EVIDENCE_PATH is required');
  process.exit(1);
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const transcriptTail = (evidence.gate?.transcript ?? '').split('\n').slice(-20).join('\n');

const prompt = [
  'You are the independent reviewer. Do not use tools: everything you need is below.',
  '',
  `Task: ${evidence.taskId}`,
  `Acceptance command: ${evidence.taskAcceptance}`,
  `Declared scope: ${(evidence.scope ?? []).join(', ') || '(none)'}`,
  `Gate exit code: ${evidence.gate?.exitCode}`,
  '',
  'Gate transcript (tail):',
  transcriptTail,
  '',
  `Changed files (uncommitted): ${(evidence.changedFiles ?? []).join(', ') || '(none)'}`,
  '',
  'Recorded patch:',
  evidence.diff || '(no diff recorded)',
  '',
  'Binding policy for this repository:',
  '1. Money is never accumulated in binary floating point; sums use integer cents converted once.',
  '2. The only float -> cents conversion is a single explicit Math.round(amount * 100) at a named boundary.',
  '3. toFixed is never used on a monetary value.',
  '4. No currency symbol, currency code or locale formatting is introduced.',
  '5. Every exported function has a test covering a rounding edge case.',
  '',
  'Judge: did the gate really pass, is the patch inside the declared scope, and does the diff honour the policy?',
  'Reply with ONLY a JSON object and no other text:',
  '{"verdict":"accept"|"reject","reasons":["..."]}',
].join('\n');

process.stdout.write(prompt);
