# Q1-T4 usability validation

## Scope

Improve the existing DocFlow entry forms and workflow actions without adding business
features or changing server-derived money/status rules. Routes, the status machine
(draft → submitted → approved | rejected; rejected → draft; approved terminal),
permanent detail ownership, database immutability constraints and currency-neutral
decimal strings are unchanged. No dependencies, services or global overflow masking
were added.

## What changed

### Document entry form (`components/documents/document-form.tsx`)

- A vendor search filter narrows a native, keyboard-operable `<select>`; the current
  selection always stays available. The match count is announced with `role="status"`.
- Every field exposes inline validation: `aria-invalid`, `aria-describedby` pointing at
  the specific error, and an inline message for vendor, date, notes, line item,
  quantity and price. Server-side Zod messages remain the single source of truth.
- After a failed save, focus moves to the first invalid control; form-level failures
  focus the alert (`tabIndex={-1}`).
- The form explains that Save creates an editable draft, shows pending state
  (`Saving…`, disabled fieldset) to prevent duplicate submits, and keeps entered values
  when validation fails.
- Line-item rows reflow to one column on small screens and keep the desktop
  item/quantity/price/remove grid.

### Vendor form (`components/vendors/vendor-form.tsx`)

- Inline field errors with the same focus/`aria` behaviour, clear hints for code format
  and uniqueness, and pending feedback.
- Clearing **Active** on an existing vendor now opens a confirmation dialog that states
  the vendor will leave new-document choices while history is kept.

### Consequential actions (`components/ui/confirmation.tsx`, `confirmed-action.tsx`)

- Document transitions (submit, approve, reject, reopen as draft) and vendor
  deactivate/reactivate are confirmed in a native modal `<dialog>`.
- Dialog copy names the document/vendor, line count and total, and states the exact
  consequence: submitted becomes non-editable, approval is final, rejection can be
  reopened, deactivation keeps history.
- Focus moves to **Cancel** on open, Tab/Shift+Tab stay in the dialog, Escape and
  Cancel close without acting, and focus returns to the triggering control. Confirm
  submits only after the explicit confirmation; the button shows pending feedback.
- Approved documents still expose no transitions and no edit link.

### Feedback and states

- Saving a document redirects with an explicit success banner (“Draft saved.”); status
  changes report “Document is now …”. Vendor toggles report deactivated/reactivated
  rather than a generic save message.
- Existing empty states (dashboard, documents, vendors, no active vendors) and error
  alerts were kept and remain accessible.

## Tests

- Updated `tests/e2e/docflow.spec.ts` to interact with the new dialogs explicitly
  (focus, Confirm, success banner) instead of bypassing them, and to scope amount
  assertions to the table body so the confirmation summary’s total cannot create a
  strict-mode duplicate.
- Added `tests/e2e/zz-usability.spec.ts` (runs last, owns and cleans its fixtures):
  - empty document form → inline errors for vendor/date/item, first invalid field
    focused, vendor filter announced, successful draft save and server total;
  - submit/approve dialogs: Cancel focused, Tab/Shift+Tab order, Escape and Cancel leave
    the draft untouched, Confirm transitions and reports the new status, approval is
    final, `/edit` redirects for an approved document;
  - vendor deactivate/reactivate dialogs: Escape and Cancel preserve state, Confirm
    updates availability, and clearing Active in the vendor form asks first;
  - form pages and the open dialog have no document-level horizontal overflow at 375,
    768 and 1024px.
- The browser suite still verifies real draft and approved PDF downloads and the
  explicit non-WinAnsi export error, and the P3 responsive/no-overflow checks remain in
  `00-dashboard.spec.ts`.

## Commands and results

```
TEST_DATABASE_URL=postgresql://docentra:docentra@127.0.0.1:56000/docentra_quality_integration_20261102 \
HARNESS_BUILD=1 TASK_ID=Q1-T4 \
TASK_ACCEPTANCE='npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run test:e2e' \
bash scripts/gates.sh
```

Final run:

| Gate | Result |
|---|---|
| G0–G3 (harness) | PASS, 27 tests |
| Typecheck | PASS |
| Lint | PASS |
| Unit | PASS, 34 tests |
| Integration | PASS, 56 tests (disposable integration DB) |
| Production build | PASS |
| Browser E2E | PASS, 8 tests |

The E2E runner reported `cleanup: true` and `preserved: true`; the development database
fingerprints were identical before and after, and the dedicated random
`docentra_e2e_*` database was dropped. Approved fixtures are intentionally not deleted
because the database immutability constraint forbids it; the disposable database is
discarded by the runner.

Artifacts (temporary, machine-local):

- `/private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/q1-t4-gates-final.log`
- `/private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/q1-t4-e2e-4.log`

## Test-harness corrections (honest record)

The product implementation was not changed while the following test-only defects were
fixed. Each failed run is recorded rather than hidden:

1. Confirmation summaries contain the document total, so unscoped `getByText`/cell
   locators matched both the hidden dialog summary and the table. Fixed by scoping to
   the table body.
2. `docflow.spec.ts` `beforeAll` assumed no prior vendors and re-ran after a failed
   test; it now asserts the seed row idempotently and checks the empty state at the
   start of the first test.
3. Native modal focus does not wrap forward from the last control in this Chromium
   build; the test now verifies initial focus, Tab order and Shift+Tab back to Cancel.
4. Cleanup attempted to delete an approved document, correctly triggering the
   immutability constraint. Cleanup now leaves immutable approved fixtures in the
   disposable database.

## Known limits

- The PDF font limitation from P1 is unchanged: standard fonts cannot encode
  non-WinAnsi scripts or emoji, and export fails explicitly instead of corrupting text.
- Token usage and cost remain `unmeasured`.
