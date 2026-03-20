## Why

Better Auth provides a flexible database adapter API, but this project does not yet offer a MikroORM-backed adapter for teams that already use MikroORM as their primary persistence layer. Adding one now lets Better Auth users integrate with an existing ORM stack instead of maintaining a separate adapter or switching data access tools.

## What Changes

- Add a new Better Auth database adapter package entry point for MikroORM.
- Implement the Better Auth adapter contract on top of MikroORM entity manager and query capabilities for the core auth models.
- Implement `createSchema` so the adapter can generate MikroORM entity files from Better Auth model metadata using `ts-morph`.
- Support Better Auth schema/table-field transformations through the adapter factory helpers rather than hard-coded table names.
- Use `pnpm` for dependency management and project scripts.
- Provide adapter tests that validate CRUD, query, counting, and schema-related behavior against an in-memory SQLite database powered by `@mikro-orm/sqlite` and exercised through `@better-auth/test-utils`.
- Document the expected adapter configuration, supported database capabilities, and testing strategy for future contributors.

## Capabilities

### New Capabilities
- `mikro-orm-adapter`: A Better Auth database adapter that uses MikroORM to persist and query Better Auth models, and can generate MikroORM entity files, while honoring Better Auth schema transformations.

### Modified Capabilities
- None.

## Impact

- Adds a new adapter implementation and public export surface for this package.
- Introduces Better Auth and MikroORM runtime dependencies plus `ts-morph`-based schema generation and `pnpm`-managed adapter test tooling based on `@better-auth/test-utils` and `@mikro-orm/sqlite`.
- Establishes the baseline contract and test coverage needed to maintain compatibility with Better Auth adapter expectations.
