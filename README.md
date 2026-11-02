# Docentra

Intelligent business document management. **DocFlow** — vendor purchase documents
with line items, approval statuses and PDF export — is the first module, and the
pilot for the workflow harness in this repository.

M0 status: **workflow harness only**. No product code exists yet.

## The loop

```
Manager → Implementer → Gates → Independent Reviewer → Manager
```

- `AGENTS.md` — the agent contract (roles, rules, gates, resume protocol)
- `PLANS.md` — milestones, DocFlow scope, PostgreSQL design
- `tasks/state.json` — task register and checkpoints (atomic writes)
- `journal/` — append-only, human-readable execution trail
- `tasks/evidence/` — gate transcripts and review verdicts, per run

## Commands

```bash
bash scripts/gates.sh          # the only definition of "green" (agents + CI)
node scripts/next-task.mjs     # what the loop would do next, as JSON
node scripts/loop.mjs          # execute authorized tasks until done/blocked
bash scripts/verify-m0.sh      # prove the harness: 5 isolated scenarios
```

Run with a real implementer:

```bash
HARNESS_IMPLEMENTER_CMD='opencode run "$TASK_BRIEF"' node scripts/loop.mjs
```

Without that variable, tasks must be marked `synthetic: true`; the loop records
"no implementer invoked" rather than pretending a model ran.

## What is deliberately not here yet

No Next.js app, no database, no dependencies, no deployment. M1 starts only after
M0 is verified and approved — see `PLANS.md`.
