## Context

This repository is currently an empty package scaffold, so the change needs to define both the adapter architecture and the package shape. The project uses `pnpm`, so dependency installation, scripts, and contributor instructions should follow `pnpm` conventions. Better Auth's adapter guide centers the implementation around `createAdapterFactory`, which already handles schema-aware model and field naming, JSON/date/boolean transformations, and join fallback behavior. MikroORM, on the other hand, is most ergonomic when working with registered entity metadata, but this adapter needs to operate on Better Auth's runtime model names and transformed field names rather than on application-specific entity classes.

The most important constraint is therefore compatibility with Better Auth's database-adapter contract without forcing consumers to duplicate their auth schema as MikroORM entities. The implementation also needs to fit MikroORM's request-scoped entity manager model and remain portable across SQL drivers that MikroORM supports.

## Goals / Non-Goals

**Goals:**
- Provide a package export that creates a Better Auth adapter backed by MikroORM.
- Support the Better Auth runtime adapter methods needed for create, update, updateMany, delete, deleteMany, findOne, findMany, and count.
- Expose `createSchema` so the adapter can generate MikroORM entity files from Better Auth schema metadata.
- Honor Better Auth schema transformations by using the transformed model and field names passed into the adapter layer.
- Support transactional execution through MikroORM when Better Auth requests it.
- Ship a repeatable integration test setup that validates the adapter against Better Auth's adapter test utilities.

**Non-Goals:**
- Requiring consumers to define MikroORM entity classes for Better Auth's tables.
- Supporting MongoDB or other non-SQL MikroORM drivers in the first implementation.
- Implementing native join handling in the first version; Better Auth's built-in multi-query join fallback is sufficient initially.
- Generating MikroORM migrations or automatically wiring the generated entity files into a consumer's ORM bootstrap.

## Decisions

### 1. Build the adapter on top of MikroORM's SQL execution layer, not entity metadata

The adapter will target MikroORM SQL drivers and treat Better Auth's `model` and transformed field names as the source of truth. Instead of calling entity-centric APIs that expect registered entity names, the adapter will use MikroORM's SQL execution facilities exposed by the SQL entity manager to query raw table names safely.

Rationale:
- Better Auth already resolves schema naming before the adapter methods run, so the adapter receives database-facing table and column names.
- Requiring entity metadata for Better Auth tables would force consumers to maintain duplicate schema definitions and would complicate custom table naming.
- MikroORM's SQL layer still gives us transaction handling, connection reuse, logging, and portability across supported SQL dialects.

Alternatives considered:
- Use registered MikroORM entities plus `nativeInsert`/`nativeUpdate`.
  Rejected because Better Auth models are runtime strings and may not map cleanly to consumer-defined entities.
- Require a model-to-entity mapping in adapter config.
  Rejected because it increases setup cost and undermines the goal of a drop-in adapter.

### 2. Accept a request-scoped entity manager getter and normalize to a single access path

The adapter config will accept either a MikroORM entity manager instance or a function that returns the current entity manager. Internally, the adapter will normalize this to `getEntityManager()` so each adapter call can obtain the correct request-scoped manager.

Rationale:
- MikroORM relies on a scoped identity map, so long-lived singleton entity managers are not always the right choice.
- A getter-based API works for applications that bind an entity manager per request, while still supporting simple use cases that pass a single manager instance.

Alternatives considered:
- Accept only a concrete entity manager.
  Rejected because it makes request scoping awkward for many MikroORM applications.
- Accept only a `MikroORM` instance.
  Rejected because adapter methods need the execution surface, not ORM bootstrap ownership.

### 3. Start with Better Auth-managed joins instead of native SQL join support

The adapter will set `supportsJoin` to `false` in its Better Auth config. The implementation will focus on correct base CRUD and query behavior and let Better Auth orchestrate join expansion through multiple adapter calls when relations are requested.

Rationale:
- Better Auth explicitly supports this fallback path.
- Native join support would require a significantly more complex translation layer for join descriptors, aliasing, and nested result shaping.
- Deferring joins reduces risk while still delivering a fully usable adapter for standard Better Auth flows.

Alternatives considered:
- Implement native joins immediately.
  Rejected for the first change because it adds significant complexity without being required for functional correctness.

### 4. Expose driver capability flags as adapter configuration with safe defaults

The adapter config will declare Better Auth capabilities such as JSON, dates, booleans, numeric IDs, plural table naming, transactions, and debug logging. Defaults will be chosen for SQL MikroORM drivers, while allowing callers to override flags where driver behavior or schema conventions differ.

Rationale:
- Better Auth's adapter factory uses these flags to apply important transformations and validations.
- Keeping them in adapter config avoids hard-coding assumptions that may differ across SQL backends.

Alternatives considered:
- Hard-code all capability flags.
  Rejected because SQL drivers differ and consumers may use custom ID conventions or schema naming.

### 5. Implement `createSchema` as managed TypeScript entity-file generation with `ts-morph`

The adapter will implement Better Auth's `createSchema` hook by generating TypeScript MikroORM entity files with `ts-morph`. Generation will target a caller-provided output directory, emit one managed entity file per Better Auth model, and include transformed table names, transformed property/column mappings, and supported scalar metadata derived from the Better Auth schema definition.

Rationale:
- The user-facing requirement is to generate entity files, not in-memory metadata objects.
- `ts-morph` provides stable AST-based file creation and updates without hand-writing fragile string templates.
- Keeping generated files in a dedicated output directory makes regeneration deterministic and reduces the risk of overwriting handwritten domain entities.

Alternatives considered:
- Return runtime-only schema metadata from `createSchema`.
  Rejected because the desired workflow is checked-in entity files.
- Generate files with plain string concatenation.
  Rejected because it is harder to evolve safely as field mappings and decorators grow more complex.
- Generate decorator-free `EntitySchema` objects instead of entity files.
  Rejected because the requirement is explicitly to create entity source files.

### 6. Validate the adapter with Better Auth's dedicated adapter test utilities and `@mikro-orm/sqlite`

The package will use `pnpm` to install and run the test toolchain, including `pnpm install -D @better-auth/test-utils @mikro-orm/sqlite`, alongside `vitest` and an in-memory SQLite setup powered by `@mikro-orm/sqlite` for speed and determinism. Test helpers will create the Better Auth tables before each suite and clean them up afterward.

Rationale:
- Better Auth's own adapter test utilities provide the closest contract-level validation.
- `@mikro-orm/sqlite` keeps the initial test matrix simple while still exercising the MikroORM integration surface through a real SQL driver.

Alternatives considered:
- Write only bespoke unit tests.
  Rejected because they would provide weaker coverage against Better Auth's actual adapter contract.
- Start with a multi-database matrix.
  Rejected because it adds setup overhead before the adapter API is proven.

## Risks / Trade-offs

- [SQL-driver-only scope may disappoint users expecting MongoDB support] → Document the scope clearly and type the config so unsupported drivers fail early.
- [Raw-table query translation can drift from Better Auth expectations] → Centralize query-building helpers and validate behavior with Better Auth's adapter test suite.
- [Generated entity files could overwrite user-owned code] → Restrict `createSchema` to a dedicated managed output directory and mark generated files clearly.
- [Type mapping between Better Auth fields and MikroORM decorators may be incomplete on the first pass] → Start with Better Auth's core auth models and cover the mapping with snapshot-style generation tests.
- [Deferring native joins may leave some performance on the table] → Keep the adapter surface join-ready so native join support can be added in a follow-up change without breaking callers.
- [Capability flags may be misconfigured for a specific deployment] → Provide conservative defaults, clear docs, and focused tests for transformation-sensitive data types.

## Migration Plan

1. Add the package structure, TypeScript build setup, `pnpm` scripts, runtime dependencies, and test tooling required for the adapter.
2. Implement the adapter factory and SQL query helpers behind a single public export.
3. Implement `createSchema` with `ts-morph` so the adapter can emit managed entity files.
4. Add integration tests that create Better Auth tables, run the adapter contract, and verify cleanup, plus generation tests for emitted entity files.
5. Document package usage and release the initial adapter version.

Rollback strategy:
- If implementation proves unstable before release, keep the change unpublished.
- If a published version regresses consumers, roll back by reverting the export in a patch release and documenting the compatibility issue.

## Open Questions

- Should the first release expose a minimal query-builder abstraction internally so native join support can be layered on without reshaping the adapter code?
- Should generated entities use decorator-based classes only, or should we also emit a small generated index/barrel file for easier registration in MikroORM config?
