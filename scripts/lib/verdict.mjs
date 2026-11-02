// Verdict extraction for model-based reviewers.
//
// A model CLI wraps its answer in prose, logs, or ANSI status lines, so the
// verdict object has to be found rather than assumed. Kept in its own module so
// it can be unit-tested without importing the task loop.
function parseReasonList(source) {
  try {
    const parsed = JSON.parse(`[${source}]`);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item));
  } catch {
    // fall through to a token scan
  }
  return [...source.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) =>
    match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
  );
}

export function extractVerdict(text = '') {
  const marker = text.lastIndexOf('"verdict"');
  if (marker === -1) return null;

  const start = text.lastIndexOf('{', marker);
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  // Every JSON parse above is strict. Reviewers occasionally emit a stray
  // escape inside a reason, which makes the object unparseable even though the
  // judgement itself is unambiguous. Losing an accepting verdict to a typo
  // would misrecord what the reviewer actually decided.
  const tail = text.slice(Math.max(0, marker - 200));
  const decision = /"verdict"\s*:\s*"(accept|reject)"/.exec(tail);
  // A truncated stream (no closing brace) is an incomplete answer, not a
  // decision: recovering from it would invent a judgement nobody finished.
  if (!decision || !tail.includes('}')) return null;

  const reasons = /"reasons"\s*:\s*\[([\s\S]*?)\]/.exec(tail);
  return {
    verdict: decision[1],
    reasons: reasons ? parseReasonList(reasons[1]) : [],
    recovered: true,
  };
}
