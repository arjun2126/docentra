// Verdict extraction for model-based reviewers.
//
// A model CLI wraps its answer in prose, logs, or ANSI status lines, so the
// verdict object has to be found rather than assumed. Kept in its own module so
// it can be unit-tested without importing the task loop.
export function extractVerdict(text = '') {
  const marker = text.lastIndexOf('"verdict"');
  if (marker === -1) return null;
  const start = text.lastIndexOf('{', marker);
  if (start === -1) return null;

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
          return null;
        }
      }
    }
  }
  return null;
}
