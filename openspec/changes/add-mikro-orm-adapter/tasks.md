## 1. Project Setup

- [x] 1.1 Add the Better Auth, MikroORM, TypeScript, `ts-morph`, and Vitest dependencies with `pnpm`, including `pnpm install -D @better-auth/test-utils @mikro-orm/sqlite` for the adapter test workflow
- [x] 1.2 Scaffold the package source structure, `pnpm` scripts, public export entry points, and shared test setup files

## 2. Adapter Foundation

- [x] 2.1 Define the MikroORM adapter config types and normalize entity-manager access to a single internal `getEntityManager()` path
- [x] 2.2 Create the Better Auth adapter factory configuration with capability flags, SQL-driver defaults, disabled native joins, and transaction support

## 3. CRUD and Query Implementation

- [x] 3.1 Implement shared SQL helper utilities for transformed filters, selected fields, sorting, limits, and offsets
- [x] 3.2 Implement `create`, `update`, `updateMany`, `delete`, and `deleteMany` on top of MikroORM's SQL execution layer
- [x] 3.3 Implement `findOne`, `findMany`, and `count` using the shared query helpers and Better Auth-compatible result shaping

## 4. Schema Generation

- [x] 4.1 Design the `createSchema` input and output contract, including the managed output directory and generated file naming strategy
- [x] 4.2 Implement `createSchema` with `ts-morph` so it generates MikroORM entity files with transformed table names and field mappings
- [x] 4.3 Add regeneration safeguards for managed files, plus any generated barrel/index exports needed for easy MikroORM registration

## 5. Verification and Documentation

- [x] 5.1 Add Better Auth adapter contract tests using `@better-auth/test-utils/adapter` with an in-memory SQLite database powered by `@mikro-orm/sqlite`
- [x] 5.2 Add focused unit tests for transformed table/field names, transaction rollback behavior, and generated entity output
- [x] 5.3 Document adapter usage, `createSchema` entity-generation workflow, supported SQL-driver scope, configuration options, and deferred features such as native joins
