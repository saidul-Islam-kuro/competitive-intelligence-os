# First Copilot Agent Prompt — Audit Only

You are taking over the existing Competitive Intelligence OS repository at the Phase 6 checkpoint.

Read `AGENTS.md`, `.github/copilot-instructions.md`, `01_PRODUCT_SPEC.md`, `02_INTELLIGENCE_ENGINE.md`, `03_ARCHITECTURE.md`, `04_DEVELOPMENT_RULES.md`, `README.md`, `VERIFY.md`, and `docs/PHASE_ROADMAP.md`.

For this first task, do not edit or create implementation files.

1. Inspect the actual source code, Prisma schema/migrations, routes, services, tests, package scripts, `vercel.json`, `.env.example`, and legacy `index.html`.
2. Verify which Phase 1–6 features actually exist.
3. Run available tests/typecheck/build/Prisma commands. If dependencies are missing, install them if the environment allows. Do not claim unrun checks passed.
4. Identify mismatches between schema and migrations, routing mistakes, authentication gaps, unsafe deployment assumptions, missing lockfile, missing database-backed verification, and any Phase 6 ingestion/sentiment/topic bugs.
5. Give a prioritized list of blockers and risks, each with file references and proposed fixes.
6. Propose the smallest safe work plan to finish Phases 7–10 in sequence.
7. Do not start React/Vite frontend work yet.

Return an honest audit report with commands run and exact results, then stop and wait for approval.
