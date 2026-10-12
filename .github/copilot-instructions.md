# Copilot instructions — Competitive Intelligence OS

Read `/AGENTS.md` and the relevant project documents before changing code. The current checkpoint is reportedly Phase 6; verify the code before trusting that claim.

Rules:
- Implement one approved phase/task at a time.
- Do not fabricate endpoints, records, metrics, integrations, or test results.
- Deterministic intelligence must work without AI keys.
- Preserve existing API contracts, database semantics, migrations, SSRF protection, and honest documentation.
- Use Prisma migrations for schema changes; never use `db push` in production.
- Keep secrets out of logs, source control, responses, and test fixtures.
- Add regression tests and run the relevant verification commands.
- Do not claim tests/builds/database checks passed unless executed successfully.
- Do not build the React + Vite frontend until Phases 7–10 are implemented and audited. The eventual frontend must be a real multi-route application, not a single long page.
- Before edits, summarize the plan and exact files to change. After edits, summarize files changed, commands run, actual results, limitations, and next step.
- If environment, database, network, or Copilot usage prevents verification, state that plainly and stop at a clean checkpoint.
