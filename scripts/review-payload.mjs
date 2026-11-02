// Build a single-shot reviewer prompt from recorded evidence plus the
// repository's review policy. One request per review: free model tiers meter
// requests, and an inline payload keeps the reviewer's inputs identical to what
// the loop recorded (no private implementer context).
import fs from 'node:fs';
import path from 'node:path';

const evidencePath = process.env.EVIDENCE_PATH;
if (!evidencePath) {
  console.error('EVIDENCE_PATH is required');
  process.exit(1);
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const policyPath = path.join(process.env.HARNESS_WORKDIR ?? process.cwd(), 'review-policy.md');
const policy = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, 'utf8').trim() : '(no review policy file)';
const transcriptTail = (evidence.gate?.transcript ?? '').split('\n').slice(-20).join('\n');
const failureNote =
  evidence.outcome === 'gate-failed' ? '\nNote: the gate FAILED for this attempt. Reject unless the evidence shows an unrelated infrastructure fault.\n' : '';

const prompt = [
  'You are the independent reviewer of a change in this repository. Do not use tools: everything you need is below.',
  '',
  `Task: ${evidence.taskId}`,
  `Acceptance command: ${evidence.taskAcceptance}`,
  `Declared scope: ${(evidence.scope ?? []).join(', ') || '(none)'}`,
  `Gate exit code: ${evidence.gate?.exitCode}`,
  failureNote,
  'Gate transcript (tail):',
  transcriptTail,
  '',
  `Changed files (uncommitted): ${(evidence.changedFiles ?? []).join(', ') || '(none)'}`,
  '',
  'Recorded patch:',
  evidence.diff || '(no diff recorded)',
  '',
  'Review policy:',
  policy,
  '',
  'Decide whether this change may be accepted. Judge only the evidence above.',
  'Reply with ONLY a JSON object and no other text:',
  '{"verdict":"accept"|"reject","reasons":["..."]}',
].join('\n');

process.stdout.write(prompt);
