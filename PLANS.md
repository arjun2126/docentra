# PLANS.md — Docentra / DocFlow

Milestone register and approved architecture. `AGENTS.md` is the agent contract;
this file is the *what* and *why*. Both are read by agents instead of re-deriving
context, which is the main token saving in this workflow.

## Status and provenance

| Item | Status |
|---|---|
| Workflow Agent design (roles, gates, review, approvals) | **Approved** — from prior decision documents |
| Workflow Agent implementation | **Not previously verified.** No harness existed in code before M0 |
| Vantage harness reuse | **Unavailable** — no Vantage folder on this machine, no matching repo. Minimal infrastructure built instead |
| Docentra product code | **Not started** (deliberately: M0 is harness-only) |
| PostgreSQL | **Approved** (mandatory). Version 16 via Docker Compose, isolated dev + test DBs |

No component is treated as working because it was designed. Working means a gate
ran and its transcript is in `tasks/evidence/`.

## Product framing

- **Docentra** — the product: intelligent business document management.
- **DocFlow** — Docentra's first module: vendor purchase documents (header +
  line items), workflow statuses, PDF export.

DocFlow is a pilot: it validates both the product concept and the workflow
harness. Module isolation: UI under a `/(docflow)` route group, database under a
dedicated PostgreSQL schema `docflow`, so future modules do not collide.

## DocFlow prototype scope

Features (prototype assumptions, **not** stakeholder-verified): dashboard; vendor
management; document create/edit; multiple line items; automatic calculations;
search and filtering; draft/submitted/approved/rejected; PDF export; responsive
UI; demonstration data.

Deliberately excluded from the prototype: multi-currency, tax/VAT handling,
partial approvals, attachments, multi-tenancy, user roles/permissions, audit
trail beyond timestamps, integrations. Adding any of these is scope expansion and
needs approval.

### Domain rules

- **SHNO** is the surrogate document identity (system-generated). **Document
  number** is the human business key: unique, `DOC-YYYY-######`.
- One header has 0..N line items. Editing is allowed only in `draft`.
- `quantity > 0`, `price >= 0`; `amount = round(quantity * price, 2)`.
- Currency is **not** hardcoded anywhere. No symbol, no `USD`, no locale-bound
  formatting containing a currency. A currency field arrives only if the
  stakeholder approves one.
- Status machine: `draft → submitted → approved | rejected`; `rejected → draft`
  (revise). `approved` is terminal.
- A document with zero line items cannot be submitted.
- Header totals are derived, never hand-entered.

### PostgreSQL design (target for M1, not yet applied)

```sql
CREATE SCHEMA IF NOT EXISTS docflow;

CREATE TABLE docflow.vendor (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  email       text,
  phone       text,
  address     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE docflow.document_header (
  shno            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_number text NOT NULL UNIQUE,
  document_date   date NOT NULL,
  vendor_id       bigint NOT NULL REFERENCES docflow.vendor(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected')),
  total_amount    numeric(16,2) NOT NULL DEFAULT 0,
  line_count      integer NOT NULL DEFAULT 0,
  notes           text,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE docflow.document_detail (
  detail_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shno      bigint NOT NULL REFERENCES docflow.document_header(shno) ON DELETE CASCADE,
  line_no   integer NOT NULL,
  item      text NOT NULL,
  quantity  numeric(14,4) NOT NULL CHECK (quantity > 0),
  price     numeric(14,2) NOT NULL CHECK (price >= 0),
  amount    numeric(16,2) NOT NULL,
  CONSTRAINT uq_detail_line UNIQUE (shno, line_no),
  CONSTRAINT ck_detail_amount CHECK (amount = round(quantity * price, 2))
);

CREATE INDEX ix_header_vendor_date ON docflow.document_header (vendor_id, document_date);
CREATE INDEX ix_header_status      ON docflow.document_header (status);
CREATE INDEX ix_detail_shno        ON docflow.document_detail (shno);
```

Notes carried into M1:

- `document_header.total_amount` / `line_count` are maintained by a trigger on
  `document_detail` (insert/update/delete) so seeds, imports and application code
  cannot drift. One custom SQL migration; covered by an integration test.
- The "cannot submit an empty document" rule is enforced in a service-layer
  transaction plus a test, not a deferred constraint trigger — not worth the
  complexity at this scale.
- `version` supports optimistic concurrency, so a resumed agent session cannot
  silently overwrite human edits.
- Money is `numeric` → Prisma `Decimal`. Never `Number()` on money; serialise at
  the API boundary.
- Status stays `text + CHECK` rather than a native enum to keep migrations cheap.
- Prisma models use `@@schema("docflow")`; `prisma.schema` must list the schema in
  the datasource for multiSchema preview.

## Workflow architecture

Unchanged from the approved design — nothing was redesigned. Reuse:

| Component | Implementation here |
|---|---|
| Agent contract | `AGENTS.md` |
| Milestone/spec register | this file |
| Task register | GitHub Issues mirroring `tasks/state.json` (M0 portable fallback: state file) |
| Implementer | OpenCode, single writer, via `HARNESS_IMPLEMENTER_CMD` seam |
| Verification | `scripts/gates.sh` — used by agents **and** CI |
| Reviewer | `scripts/review.mjs` (deterministic policy) or `HARNESS_REVIEWER_CMD` |
| Checkpoints | `tasks/state.json` (atomic writes) + `journal/` + `tasks/evidence/` |
| Approval gates | `awaiting_approval` task type; loop exits cleanly |
| Sequencing | `scripts/loop.mjs` + `scripts/next-task.mjs` |

## Milestones

| # | Milestone | Acceptance criteria | Gate |
|---|---|---|---|
| M0 | Harness bootstrap and verification | Configuration created; synthetic tasks execute; a failing gate blocks; independent review demonstrably rejects; interrupted run resumes without repeating work; evidence persisted | Human approval ✔ required |
| M1 | Foundation | Next.js+TS+Tailwind+shadcn scaffold; Compose Postgres 16 (dev+test DBs); `docflow` schema via Prisma migration; trigger + CHECK invariants proven by integration tests; idempotent seed | — |
| M2 | Vendors, shell, dashboard skeleton | Vendor CRUD + Zod validation + tests; nav/responsive shell; dashboard reads real counts | — |
| M3 | Documents | Header + line CRUD; totals correct incl. rounding edges; status transitions reject illegal moves; optimistic-concurrency conflict test | — |
| M4 | Search, filters, metrics | Query tests across number/vendor/status/date range; pagination | — |
| M5 | PDF, demo data, E2E | Playwright create→submit→approve→export; demo dataset; responsive check | — |
| M6 | Pilot retrospective | Measured: tasks, repair attempts, gate failures, review rejections, wall time, and token/cost where logs provide it | — |

Each milestone merges only on green gates plus reviewer acceptance. A blocked
task halts its dependents; unrelated tasks may continue.

## M1 plan (proposed, awaiting approval)

1. `M1-T1` Scaffold Next.js 15 + TS + Tailwind + shadcn/ui; add product gates to
   `scripts/gates.sh` (typecheck, lint, unit).
2. `M1-T2` `docker-compose.yml` with Postgres 16, separate `docentra_dev` and
   `docentra_test` databases; documented `npm run db:*` scripts.
3. `M1-T3` Prisma schema (`docflow` schema), initial migration including the
   trigger, integration tests proving CHECK/trigger/referential behaviour.
4. `M1-T4` Idempotent seed (vendors + demo documents) and a CI job that runs
   migrations against a throwaway database.

## Decisions log

### Authorized quality package — 2026-11-02

Owner authorizes P1–P4 and P6 as one autonomous local development and verification
package, with pushes to `arjun2126/docentra` after independent acceptance. This
supersedes the old local-only/no-remote authorization for this package; it does
not authorize production deployment, paid services, auth/security architecture
changes, business scope expansion, history rewriting or destruction of existing
data. Existing migrations remain unchanged; tests use explicitly disposable DBs.

Execution register: `Q1-T1` PDF browser reproduction/download/content verification;
`Q1-T2` disposable deterministic E2E isolation and CI; `Q1-T3` dashboard/navigation/
table/responsive accessibility polish; `Q1-T4` forms/validation/feedback/workflow
confirmation usability; `Q1-T5` final full regression, actual downloaded PDF,
data-preservation verification, independent review and CI. Tasks are sequential;
one delegated coding agent at a time and a separate read-only reviewer per task.
The orchestrator owns planning/checkpoints/evidence through existing harness
utilities; delegated implementers own application/test/script changes. No new
orchestration framework or business feature is authorized. Costs/tokens remain
`unmeasured` unless available from a real source.

| # | Decision | Source |
|---|---|---|
| 1 | Preserve existing Workflow Agent design; no redesign | Stakeholder |
| 2 | Docentra = product, DocFlow = first module | Stakeholder |
| 3 | PostgreSQL 16 via Docker Compose, isolated dev/test DBs | Stakeholder |
| 4 | GitHub Issues + AGENTS.md + PLANS.md + persistent journal | Stakeholder |
| 5 | One implementer, deterministic gates, one read-only reviewer; no new frameworks | Stakeholder |
| 6 | Bounded retries, evidence recording, resume support | Stakeholder |
| 7 | Short-lived branches, Conventional Commits, task IDs ↔ issues | Stakeholder |
| 8 | No hardcoded currency; no unapproved business requirements | Stakeholder |
| 9 | Nothing counts as working until executed and evidenced | Stakeholder |
| 10 | Attempt count = 2 by default; task IDs `M<n>-T<n>`; state file is the portable task register until issues are wired | Manager default (reversible) |

## Known limitations carried out of M0

- No GitHub Issue was created or read during M0. `gh` is authenticated with
  `repo` + `workflow` scopes, but no remote exists yet; the state file is the
  register. Issue-per-task wiring is a deliberate M1 step, not an assumption.
- No model-based implementer ran. OpenCode v2.1.4 is installed, but M0 proves the
  harness with synthetic tasks so that gate and review mechanics are validated
  independently of any model's behaviour.
- Token/cost metrics are `unmeasured` until a session-log source is confirmed.

## M0.5 findings (real agent integration, executed)

Verified by execution, not by configuration:

- OpenCode v2.1.4 loads `.opencode/agent/*.md`. `implementer` (primary) and
  `reviewer` (subagent) both resolve through `opencode debug agents`, in the
  repository and in an isolated fixture carrying its own `.opencode/`.
- `opencode run` blocks indefinitely when stdin stays open. Every harness call
  site pipes stdin, so the loop is unaffected — but new call sites must close it.
- Free model tiers meter **requests per model**, not tokens. A reviewer that
  spends two turns reading files exhausts its allowance and exits 1; the harness
  correctly records that as a rejection, never as an acceptance.
- Reviews are therefore single-shot: `scripts/m05-review-payload.mjs` inlines the
  recorded evidence into one request (1.1k chars for a small patch).
- Roles run on different models (`M05_MODEL_IMPL`, `M05_MODEL_REVIEW`) so one
  free allowance cannot starve the other.
- Real usage comes from `opencode stats --json --cost` snapshots via
  `scripts/verify-m05.sh stats-before|stats-after`. Aggregate only; per-task
  attribution is not reliable and is not claimed.
- Measured for the verified run: cost 0, 618k input tokens, 48k output,
  20 prompts across 18 sessions (free tier, two models).

Remaining limitations carried into M1:

- GitHub is still unwired. `gh` is authenticated with `repo` and `workflow`
  scopes, but no remote exists, so no Issue and no workflow run has ever executed.
- Reviewer judgement is a real model, not a deterministic check. One probe shows
  it rejects a policy violation; that is evidence of capability, not a guarantee.
- Task `workdir` lets a task act on an isolated fixture. Real Docentra tasks still
  default to the repository root and have never run through a model.
