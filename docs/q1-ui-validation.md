# Q1-T3 UI validation

## Scope

Polish the existing indigo/neutral DocFlow shell, dashboard, document/vendor lists
and document detail. Preserve routes, data rules, form/workflow behavior and
currency-neutral decimal strings. No dependencies, services or animations added.
The five KPIs use a five-column desktop grid; smaller screens reflow. Status
segments use count / total, with a named textual count/percentage legend and an
explicit empty state. Percentages are rounded, so displayed percentages can sum
to 101. Tables retain readable minimum widths in named keyboard-scrollable
regions. Links styled as buttons do not nest interactive buttons.

## Proven 768px overflow cause and repair

The original two failed runs remain recorded. The owner subsequently authorized
up to two additional focused candidate repair validations. Two diagnostic runs
of the unchanged layout reproduced the known failure; they are not candidate
repair attempts.

At `/vendors`, Chromium measured:

- Window: 768px; document scroll width: **821px**.
- Main: x=208–768, width 560px, `min-width: 0`.
- Vendor grid: x=240–736, width and computed single grid track **496px**.
- Vendor form: x=265–711, width 446px; email/phone tracks 215px each.
- Table: width/min-width **660px**, inside a 494px scrollport with 708px
  scrollable width. This intentional table overflow was already contained.
- The visually hidden **Actions** column label (`th > span.sr-only`) is
  absolutely positioned at x=819.984–820.984. With no positioned ancestor in
  the scrollport, its containing block escaped the table's clipping ancestry,
  extending the document to 821px. Grid/form intrinsic sizing was not the cause.

A reversible browser-only probe changed only the table region's `position`:

| Region position | Document width | Region client/scroll width |
|---|---:|---:|
| static, before | 821 | 494 / 708 |
| relative | 768 | 494 / 708 |
| static, restored | 821 | 494 / 708 |

The repair adds `position: relative` to `.table-scroll`, establishing the local
containing block for accessible absolute captions/labels. No root overflow
hiding, table removal, constraint change or form behavior change is involved.
The temporary probe is not present in the regression test.

## Reproduction and regression

Browser/server writes use only `npm run test:e2e`, the P2 disposable runner.
The new test verifies the launch receipt's database name/OID/marker before its
fixture writes, adds six documents through valid draft/submitted transitions,
then deletes only its own vendor/documents in `finally`. The deterministic seed
and existing E2E tests are preserved.

The regression checks all five KPIs empty and populated; status counts and exact
segment proportions; visible skip link, focus outline and focus transfer to
main; keyboard navigation/active state; no nested link/button; positioned named
table regions and keyboard horizontal scrolling; page-level
`document.documentElement.scrollWidth <= window.innerWidth` at **1440, 1024,
768, 390, 375 and 320px** on dashboard, documents, vendors and draft detail.
Each route/width writes geometry JSON and a full-page screenshot before its
overflow assertion. Dashboard accessible names/landmarks and rendered styles
are attached. Late table-heading and approved-notice contrast changes have
explicit rendered-color assertions.

Full candidate validation command:

```sh
TEST_DATABASE_URL=postgresql://docentra:docentra@127.0.0.1:56000/docentra_quality_integration_20261102 \
HARNESS_BUILD=1 TASK_ID=Q1-T3 \
TASK_ACCEPTANCE='npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run test:e2e' \
bash scripts/gates.sh
```

## Evidence

Base: `/private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/`.

- `q1-t3-artifacts/before/`: original HEAD baseline desktop/mobile dashboard.
- `q1-t3-resume-diagnostic.log`: unchanged-layout reproduction.
- `q1-t3-root-cause-probe.log`: reversible containing-block diagnosis.
- `q1-t3-resume-artifacts/diagnostic/` and `probe/`: screenshots, geometry,
  trace and database preservation/cleanup reports. In `probe/test-results/`,
  `vendors-768-containing-block-probe.json` records all three measurements.
- `q1-t3-repair-1-gates.log`: first newly authorized candidate's full gates.
- `q1-t3-final-gates.log`: same layout candidate, rerun after persisting the
  accessibility/style attachments to files; **GATES: PASS**.
- `q1-t3-resume-artifacts/final/`: final screenshots/geometry, accessible tree,
  rendered focus/text styles, PDF regression downloads, before/after development
  snapshots and runner report; `responsive-summary.json` records all 24 passes.
- `q1-t3-contrast.json`: source-palette relative luminance calculations (not a
  whole-page automated audit). Body/card 17.72:1; muted/card 4.86:1; table heading
  7.17:1; approved notice 16.16:1; brand/white 10.03:1; active navigation 8.32:1.

## Final candidate result

One additional focused layout repair candidate; **zero failed candidate repair
validations**. Its first full gate run and final evidence-persistence rerun both
passed: G0–G3, typecheck, lint, 34 unit tests, 56 integration tests, production
build, the exact task acceptance command, and all four E2E tests. The original
two failures and both expected-failing diagnostic baseline runs were not erased.

All four routes passed all six widths. At `/vendors` 768px, document width is now
768px, table region client/scroll widths remain 494/708px, and keyboard
ArrowRight moves the table scroll position. The late table-heading and approved
notice foreground assertions passed against the final production app.

Inspected real Chromium screenshots of the dashboard at desktop/mobile, vendors
at 768/375px, document list at 768/375px, and detail at 375px. Also inspected the
persisted accessible tree: one main, named Main navigation, Summary KPI groups,
Status legend and named table region/caption. The browser confirms skip-link
focus and main-focus transfer, a solid indigo focus outline, active navigation,
keyboard mobile-menu entry and horizontal table scrolling. No interactive
nesting was found on the four checked routes. The desktop browser-preview
connection was unavailable; screenshots were inspected directly from the safe
runner's actual Chromium renderings instead.

Final runner target `docentra_e2e_run_f6ba5851685c494db15e2b4e` reports
`cleanup: true`, `preserved: true`; development before/after snapshot files are
byte-identical. All diagnostic and candidate runner targets also reported
preservation and cleanup. No regular development DB write was performed.

The diagnostic runner reports both `preserved: true` and `cleanup: true` for
both disposable databases. It saves read-only before/after development table
snapshots. No manual app server or browser connection to the development DB
was used. Tokens/cost remain unmeasured.

These checks and visual inspection are not an accessibility compliance claim.
Screen-reader interaction, physical devices and non-Chromium browsers remain
outside the performed checks. Separate read-only review/acceptance and
orchestrator-owned metadata/commit are required.
