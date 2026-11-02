# Q1-T1 PDF validation

## Reproduction (before implementation)

Actual Chromium/Playwright interaction clicked the detail page's **Download PDF**
anchor on an isolated app at port 3111. The ordinary seeded approved document
downloaded successfully (HTTP 200); a general transport failure was **not**
reproduced. A valid UI-created draft with vendor `Café Müller` and a 162-character
item reproduced content loss. Apple's PDFKit extracted:

```text
Vendor: Caf? M?ller (PDF-Q1)
1 Cr?me br?l?e - Long catalogue description with specification2.5000 12.34 30.85
```

The actual root causes were the renderer's ASCII-only replacement, `slice(0, 60)`
on every cell, and drawing without measuring/wrapping text. Column widths also
exceeded the printable width (518 points versus 499).

## Fix and limits

Preserve WinAnsi-supported text (including accents and typographic punctuation),
measure/wrap cells and metadata, fit columns inside margins, and paginate wrapped
lines. Export stored quantities/prices/amounts/totals unchanged. Download through
a client button with pending state and a named accessible alert; server failures
return useful JSON without navigating away or changing the document.

**Remaining limitation:** the existing standard fonts do not cover all Unicode
scripts (e.g. Japanese) or emoji. Such documents now receive an explicit error,
not a silently corrupted PDF. Full-script export needs approval for an embeddable
font and fontkit dependency (or another renderer); neither was added here.

## Isolation

Created only `docentra_q1_pdf_20261102_2209` in existing `docentra-db`; deployed the
eight unchanged migrations and seeded fixtures there. All app/build/browser
commands explicitly use:

```sh
DATABASE_URL=postgresql://docentra:docentra@127.0.0.1:56000/docentra_q1_pdf_20261102_2209
TEST_DATABASE_URL=postgresql://docentra:docentra@127.0.0.1:56000/docentra_quality_integration_20261102
```

No regular database was reset, seeded, or used by a started app. Disposable DB
retained for inspection. Manual server listener PID 4275 was stopped; Playwright
owns/stops its own port-3100 server. No config/scripts changes or new dependency.

## Verification and evidence

Evidence directory (absolute):
`/private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/`

- Before: `q1-pdf-before-approved.pdf`, `q1-pdf-before-approved.pdf.json`,
  `q1-pdf-before-long-ui.png`, `q1-pdf-before-long.pdf`, `q1-pdf-before-long.txt`.
- After: `q1-pdf-after-{draft,approved}.pdf`, corresponding `.png` UI captures,
  `.txt` PDFKit extraction and `-render.png` PDFKit rasterizations.
- `q1-validate-pdf.swift` independently opens and renders both PDFs using Apple's
  PDFKit and asserts vendor, number, date, status, complete item text, quantity,
  price, amount and total; `q1-pdf-pdfkit-validation.log` records both passes.
  Initial extraction assertions needed column selection and whitespace
  normalization: spatial PDF extraction interleaves numeric columns and can join
  wrapped words. No expected non-whitespace characters were removed.
- `q1-pdf-gates-attempt1.log`: gates + acceptance + production build passed;
  22 harness, 34 unit, 56 integration tests. Final rerun also passed, recorded in
  `q1-pdf-gates-attempt2.log` after the browser error-label repair.
- `q1-pdf-browser-attempt1.log`: download/content workflow and validation passed;
  error test failed because Next.js has an additional empty `role=alert`.
  Repaired with an explicitly named PDF alert (no assertions skipped).
- `q1-pdf-browser-attempt2.log`: all three browser tests passed using `CI=1`;
  actual button clicks/download events for draft and approved documents,
  pdf-lib parsing/decompressed text validation, unsupported-script error and
  network-failure/retry feedback. Successful downloads are also attached in
  `test-results/docflow-a-document-can-be--09a58-roved-searched-and-exported-chromium/`
  (directory name may change with Playwright versions).

Commands (with both database variables above exported):

```sh
HARNESS_BUILD=1 TASK_ID=Q1-T1 \
  TASK_ACCEPTANCE='npm run typecheck && npm run lint && npm run test:unit && npm run test:integration' \
  bash scripts/gates.sh
CI=1 npm run test:e2e
swift /private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/q1-validate-pdf.swift
```

Separate read-only review and orchestrator-owned evidence/state/journal/commit
remain required. Tokens/cost: unmeasured.
