# Review policy

Short, checkable rules. The reviewer cites the rule it relied on.

1. **Evidence over claims.** The gate transcript must show `GATES: PASS`. A
   summary saying tests passed is not evidence.
2. **No gate tampering.** Reject if a check was skipped, weakened, made trivially
   true, or if a test was deleted to make the suite green.
3. **Scope.** Every changed path must sit inside the task's declared scope.
   Widening scope needs human approval first.
4. **Money.** Monetary values are `numeric`/`Decimal`, never floating point in
   storage or arithmetic. No currency symbol, currency code or locale money
   formatting anywhere. Currency is an unapproved product decision.
5. **Database invariants.** Migrations must keep the declared CHECK constraints,
   unique constraints, foreign keys and the totals trigger. Dropping a constraint
   to make code simpler is a rejection.
6. **Dependencies.** Only the approved stack (Next.js, TypeScript, Tailwind,
   shadcn/ui, Prisma, Zod, Vitest, Playwright, pg). A new dependency needs
   justification; a new service needs approval.
7. **No secrets, no deployment.** No credentials in the repository, no deploys, no
   remote repository creation.
8. **Scope of the milestone.** Features from M2 onward (vendors UI, document
   editing, search, PDF) do not belong in M1 foundation work.
