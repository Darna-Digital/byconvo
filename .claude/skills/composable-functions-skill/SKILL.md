---
name: composable-functions-skill
description: Generate boilerplate for composable, testable TypeScript features using dependency injection. Use when the user wants to scaffold a new feature with clean code patterns, create testable functions with DI, generate RSC or React Hook adapters, or set up a feature structure with interfaces/functions/mocks/tests in src/features.
---

## Pattern

The composable functions pattern uses:
- Interfaces defining dependencies (data + side effects) and function contracts
- Pure functions that receive injected dependencies
- Mock factories for testing
- Adapters (RSC/Hooks) that wire up real dependencies

## Workflow

1. Read the example structure in `example/` to understand the patterns
2. Ask the user for the feature name
3. Generate minimal boilerplate in `src/features/<feature-name>/` with:
   - `entity/<feature>.interfaces.ts` - dependency and function interfaces
   - `functions/<feature>.functions.ts` - pure functions with DI
   - `functions/<feature>.functions.mock.ts` - mock factory
   - `functions/<feature>.functions.test.ts` - test file
4. Ask the user what adapter type to create:
   - **RSC** (React Server Components) - default
   - **React Hooks** - default
   - **Other** (API, proxy-handler, etc.) - search codebase for examples, otherwise improvise
5. Generate the adapter in `adapters/<feature>.<type>.adapter.ts`

Do not implement business logic - generate bare minimum boilerplate only.
