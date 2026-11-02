# AGENTS.md — Docentra Workflow Agent contract

This file is the operating contract for every agent working in this repository.
Milestones and architecture live in `PLANS.md`. Task state lives in `tasks/state.json`;
the human-readable trail lives in `journal/`.

Docentra is the product. **DocFlow** is its first module (document management).
M0 builds and verifies the workflow harness only — no product code.

## Roles

| Role | Actor | Writes code? | Responsibility |
|---|---|---|---|
| Manager | Human + ChatGPT oversight | No | Approve milestones, resolve blockers, gate irreversible actions |
| Implementer | OpenCode (single writer) | **Yes** | Implement one task, run the gates, report evidence |
| Gates | `scripts/gates.sh` | No | Deterministic pass/fail. The only definition of "green" |
| Reviewer | Independent read-only pass | **No** | Judge the evidence; accept or reject with reasons |

One code-writing agent per repository at a time. Do not run a second implementer
against the same worktree.

## Non-negotiable rules

1. **Never bypass a failing gate.** No skip flags, no weakened assertions, no
   commenting out a check to continue. Record the failure and stop.
2. **The reviewer never edits implementation code.** It may only produce a
   verdict. Fixes belong to the implementer.
3. **Stop and request human approval** for: production deployment, destructive
   or irreversible operations, significant architecture changes, new paid
   services, sensitive security changes, and scope expansion beyond `PLANS.md`.
4. **Do not add orchestration frameworks, extra agents, or MCP servers** without
   approval. Reuse `scripts/` and the existing agent definitions.
5. **No invented measurements.** Record token usage and cost only when a real
   source (session log, provider usage) provides them; otherwise write
   `unmeasured`.
6. **Record assumptions, never silently invent requirements.** Currency,
   multi-tenancy, roles and approval routing are unapproved product decisions.

## Task lifecycle

```
pending ──► in_progress ──► review ──► done
                │               │
                ├──► blocked     └──► blocked (review rejected)
                └──► awaiting_approval   (human gate; loop stops cleanly)
```

- A task is only `done` when gates passed **and** the reviewer accepted, with a
  persisted evidence record.
- **Bounded repair:** `maxRepairAttempts` (default `2`). On exhaustion the task
  becomes `blocked` and dependents never run. Escalate to the human.
- `awaiting_approval` is a task type, not an error. The loop exits `0` and waits.

## Commands

| Command | Purpose |
|---|---|
| `bash scripts/gates.sh` | Universal gates G0–G3. Exit 0 = green |
| `TASK_ACCEPTANCE='cmd' bash scripts/gates.sh` | Universal gates + task acceptance |
| `node scripts/next-task.mjs` | Print what the loop would run next (JSON) |
| `node scripts/loop.mjs` | Execute authorized tasks until done / blocked / approval |
| `bash scripts/verify-m0.sh` | Prove the harness against 5 scenarios (isolated temp roots) |

Both the agent and CI call the **same** `scripts/gates.sh`. Anything that only
passes in one of those two places is not a gate.

## Gate definitions

| Gate | Check |
|---|---|
| G0 | Required harness files exist (`AGENTS.md`, `PLANS.md`, state, journal dir) |
| G1 | `tasks/state.json` parses and satisfies the state schema |
| G2 | Every shell script passes `bash -n` (syntax) |
| G3 | Harness unit tests pass (`node --test scripts/tests/*.test.mjs`) |
| Acceptance | The task's own `acceptance` command, from `tasks/state.json` |

Product gates (typecheck, lint, unit, integration, E2E) are added to
`scripts/gates.sh` in M1, so they apply to agents and CI at the same instant.

## Evidence and journal

Every gate run writes one JSON file:

```
tasks/evidence/<TASK_ID>/<runId>.json
```

with: task id, attempts, gate transcript, acceptance command, changed files,
started/finished timestamps, exit codes, and the reviewer verdict.

`journal/YYYY-MM-DD.md` is append-only and human-readable. A task without a
journal entry is not complete.

Evidence is the source of truth for what happened. Narrating success is not
evidence; the transcript is.

## Session resumption protocol

On start:

1. `node scripts/next-task.mjs` — reads `tasks/state.json`.
2. If a task is `in_progress`, it is **resumed**, not restarted: gates re-run
   because they are idempotent; completed tasks are never re-executed.
3. An `awaiting_approval` task halts the loop. Do not self-approve.
4. A `blocked` task halts its dependents but not unrelated tasks.

State is written atomically (temp file + rename) after every transition, so a
hard kill cannot corrupt it. Never hand-edit `tasks/state.json` to skip a gate;
use it to record human approval only.

## Wiring a real implementer / reviewer

The loop never embeds a model. It calls whatever `HARNESS_IMPLEMENTER_CMD`
points at, with `TASK_ID`, `TASK_TITLE`, `TASK_SCOPE`, `TASK_ACCEPTANCE` in the
environment:

```bash
HARNESS_IMPLEMENTER_CMD='opencode run --agent implementer "$TASK_BRIEF"' \
  node scripts/loop.mjs
```

If unset, the task must be marked `synthetic: true` and no implementer is
invoked — the loop records that fact rather than pretending a model ran.
`HARNESS_REVIEWER_CMD` similarly overrides the mechanical reviewer in
`scripts/review.mjs`; it must emit `{"verdict":"accept"|"reject","reasons":[]}`.

## Conventions

- Task IDs: `<MILESTONE>-T<n>` (e.g. `M1-T3`); approval gates `<MILESTONE>-GATE`.
- Branches: `feat/m1-t3-vendor-crud` — short-lived, one task.
- Commits: Conventional Commits, task ID in the subject or body.
- Task scope is declared in `tasks/state.json` as `scope` path prefixes; the
  reviewer rejects changes outside it. Empty scope is rejected (unbounded).

## Approval boundaries (do not cross unattended)

Production deployment · destructive git or database operations · paid service
provisioning · schema-destructive migrations · authentication/authorisation
design · anything outside the approved milestone in `PLANS.md`.
