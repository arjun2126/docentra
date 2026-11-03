# Q1 final verification (P6)

## Package under verification

| Phase | Commit | Result |
|---|---|---|
| P1 — real PDF download, parsing and content verification | `f54cf64` | independent review accepted; no workflow run recorded for this commit |
| P2 — disposable deterministic E2E database and CI | `9185be9` | independent review accepted; CI run 41537474933 success |
| P3 — dashboard/navigation/table/responsive accessibility | `9eef0b2` | independent review accepted; CI run 41542296227 success |
| P4 — form validation, feedback and consequential confirmations | `8875d2d` | independent review accepted; CI run 41553019360 success |

Final verification ran on the committed P4 tree (`8875d2d`) with the registered
acceptance command and the same gates CI uses.

## Gates

```
TEST_DATABASE_URL=postgresql://docentra:docentra@127.0.0.1:56000/docentra_quality_integration_20261102 \
HARNESS_BUILD=1 TASK_ID=Q1-T5 \
TASK_ACCEPTANCE='npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run test:e2e' \
bash scripts/gates.sh
```

| Gate | Result |
|---|---|
| G0–G3 harness | PASS, 27 tests |
| Typecheck | PASS |
| Lint | PASS |
| Unit | PASS, 34 tests |
| Integration (PostgreSQL, disposable) | PASS, 56 tests |
| Production build | PASS |
| Browser E2E | PASS, 8 tests |
| Task acceptance | PASS |
| Overall | `GATES: PASS` |

## Actual PDF downloads

The browser suite downloads both PDFs from the running application, saves the bytes
and parses the page streams. Final verification independently re-parsed the saved
artifacts:

| Document | Bytes | Vendor | Number | Date | Status | Line items | Amounts | Total |
|---|---|---|---|---|---|---|---|---|
| draft | 1812 | Café Müller | DOC-2026-000001 | 2026-10-05 | Draft | Crème brûlée…, Replacement toner | 3.0000, 10.50, 31.50, 1.0000, 2.00 | 33.50 |
| approved | 1817 | Café Müller | DOC-2026-000001 | 2026-10-05 | Approved | Crème brûlée…, Replacement toner | 3.0000, 10.50, 31.50, 1.0000, 2.00 | 33.50 |

All content checks returned true for both documents. The explicit export error for
non-WinAnsi text is still exercised and leaves the document usable for retry.

## Development data preservation

The E2E runner fingerprints the development database before and after the browser
suite and refuses to write to it. The dedicated random `docentra_e2e_*` database is
created with a marker and OID, verified against the HTTP app, then dropped
(`cleanup: true`, `preserved: true`).

Independent read-only comparison against the package baseline:

| Table | Count | Fingerprint | Unchanged |
|---|---|---|---|
| vendor | 13 | `85967cd9f1e9b89b36fb49f897ee7694` | yes |
| document_header | 19 | `f24a90ba4d9a6d18a418eaeb74c1c768` | yes |
| document_detail | 41 | `b04dac65acd2bbe4587c2058a6fc1a6f` | yes |

All 8 Prisma migration names and checksums match the baseline; no migration was
edited or added by the quality package.

## Accessibility, responsive and keyboard regression

- `00-dashboard.spec.ts` checks four routes at 320, 375, 390, 768, 1024 and 1440px
  (24 checks): no unintended document-level overflow, internally scrollable named
  table regions, keyboard horizontal scrolling, visible focus treatment, skip link,
  one `main`, current-page navigation state, and an accessibility-tree snapshot.
- `zz-usability.spec.ts` checks the document/vendor forms and an open confirmation
  dialog at 375, 768 and 1024px for no document-level overflow.
- Dialog tests verify initial focus on Cancel, Tab/Shift+Tab order, Escape and Cancel
  no-op, focus return to the trigger, and Confirm as the only action path.
- The P3 `/vendors` 768px repair remains: the hidden “Actions” label is contained by
  the relative scroll region; the table scrolls internally rather than extending the
  document.

## Business rules and immutability

- Status machine unchanged: draft → submitted → approved | rejected; rejected → draft;
  approved terminal; only drafts editable.
- Totals and amounts remain server-derived exact decimal strings; no currency
  assumption was introduced.
- Permanent detail ownership and approved-document immutability are unchanged.
  The integration guards (20 tests) pass. Usability cleanup correctly could not delete
  an approved document; those fixtures were left in the disposable E2E database, which
  the runner drops.

## GitHub Actions

The `gates` workflow ran on the pushed phase commits and completed successfully:

| Commit | Run | Conclusion |
|---|---|---|
| `9185be9` (P2) | 41537474933 | success |
| `9eef0b2` (P3) | 41542296227 | success |
| `8875d2d` (P4) | 41553019360 | success |

No workflow run is recorded for the P1 commit itself; P1 was independently reviewed
and its browser/PDF evidence was carried into the later green runs. The final
verification commit is checked after it is pushed.

## Artifacts

- Gate log: `/private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/q1-t5-gates-final.log`
- E2E artifacts: `/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/docentra-e2e-Se6g7A`
  (downloaded `draft.pdf`/`approved.pdf`, report, before/after fingerprints,
  screenshots, geometry and accessibility snapshot)

## Known limits

- Standard PDF fonts cannot encode non-WinAnsi scripts or emoji; export fails with an
  explicit error instead of corrupting text.
- Token usage and cost are `unmeasured`; no provider usage record was available.
