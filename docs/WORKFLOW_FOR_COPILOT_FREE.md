# Working with Copilot Free

## Recommended loop
1. Open the repository root in VS Code.
2. Ensure the current Phase 6 state is committed to Git before agent edits.
3. Read `AGENTS.md`, `VERIFY.md`, and the current phase brief.
4. Ask Copilot to audit first, with no code edits.
5. Approve one coherent implementation task.
6. Review its proposed files/diff before accepting broad changes.
7. Run commands locally and inspect test output.
8. Commit each verified milestone.
9. Update `VERIFY.md` and the phase checklist.
10. Start the next phase only after the current phase passes its acceptance criteria.

## Usage-saving rules
- Do not ask the agent to implement Phases 7–10 in one message.
- Keep long-lived instructions in repository files rather than pasting them repeatedly.
- Give Copilot one phase brief at a time.
- Ask it to inspect existing modules and reuse them before creating new abstractions.
- Avoid repeated full-repository re-audits unless code changed materially.
- If an agent session is interrupted, ask it to read `VERIFY.md` and continue from the last verified checkpoint.
- Use focused prompts: audit, plan, implement, test, report. Avoid “finish everything” prompts.

## Git safety
Before any phase:
- `git status`
- commit the last known good state
- review the diff after the agent finishes
- run tests/build
- commit only when the changes are understood and verified

Never paste real `.env` values into chat. Use `.env.example` for names and placeholders.
