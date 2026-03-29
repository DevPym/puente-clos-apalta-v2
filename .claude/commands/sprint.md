Implement the next sprint task for Puente Clos Apalta v2.

## Workflow

1. Read `docs/ARCHITECTURE.md` sections 9 (Roadmap) and the relevant section for the current sprint.
2. Identify the next uncompleted task (marked with `- [ ]`).
3. Before writing code:
   - Read the relevant domain types from `domain/types/`
   - Read the relevant port interface from `domain/ports/`
   - Check existing tests for patterns to follow
4. Implement the task following the project's hard rules:
   - Zero `any` — use `unknown` + Zod/type guards
   - ESM imports with `.js` extension
   - `import type` for type-only imports
   - Error codes from official Oracle/HubSpot documentation only
5. Write Vitest tests FIRST (or alongside) the implementation.
6. Run `npm run test` to verify all tests pass.
7. Run `npm run lint` to verify no type errors.
8. Summarize what was implemented and what's next.

## Important

- If a value or mapping is unknown, STOP and ask the user. Never guess.
- If an Oracle LOV is empty (Activity Types, Dietary Preferences, Service Request Codes), use the documented workaround from ARCHITECTURE.md.
- Every error must carry an official error code. Check Oracle OHIP docs or HubSpot API docs.
