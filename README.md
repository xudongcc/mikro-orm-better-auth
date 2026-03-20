# mikro-orm-better-auth

Better Auth adapter for MikroORM, with a `createSchema` implementation that generates MikroORM entity files via `ts-morph`.

## Install

```bash
pnpm add better-auth @mikro-orm/core @mikro-orm/knex prettier ts-morph
pnpm add -D @better-auth/test-utils @mikro-orm/sqlite typescript vitest
```

## Usage

```ts
import { betterAuth } from "better-auth";
import { mikroOrmAdapter } from "mikro-orm-better-auth";
import { MikroORM } from "@mikro-orm/core";
import { SqliteDriver } from "@mikro-orm/sqlite";

const orm = await MikroORM.init<SqliteDriver>({
  driver: SqliteDriver,
  dbName: "app.sqlite",
  entities: [],
});

export const auth = betterAuth({
  database: mikroOrmAdapter(orm.em),
});
```

## Generate Entity

Better Auth calls the adapter's `createSchema` hook, and this adapter uses `generateEntity` as the configuration key for controlling entity generation. By default it writes to `src/auth/entities`, or to the directory implied by the output path Better Auth passes in.

```ts
const adapter = mikroOrmAdapter(orm.em, {
  generateEntity: {
    outputDir: "src/auth/entities",
  },
});
```

Generated files:

- use `@Entity`, `@PrimaryKey`, and `@Property`
- include one managed `*.entity.ts` file per Better Auth model
- reflect Better Auth table and field name transforms
- are patched in place on regeneration instead of being fully overwritten
- are formatted with Prettier before they are written, using the resolved config for the target file path
- preserve user-owned imports, decorators, methods, extra properties, and comments
- only update generator-owned fragments such as managed fields, types, and MikroORM decorators
- do not add management comments or sidecar state files to generated entities
- do not automatically delete existing files or unmatched properties during regeneration

Managed file boundaries:

- the generator owns Better Auth-managed fields and MikroORM decorators such as `@Entity`, `@PrimaryKey`, and `@Property`
- everything else in the file is treated as user-owned code and is preserved during regeneration whenever the file can be patched safely

Unsupported or rejected cases:

- if an existing file does not contain the expected exported entity class, generation fails instead of guessing how to patch it
- direct edits to generator-owned field definitions or MikroORM decorator arguments may be replaced on the next generation

## Scope

- SQL-oriented runtime adapter using MikroORM's SQL entity manager
- `create`, `update`, `updateMany`, `delete`, `deleteMany`, `findOne`, `findMany`, `count`
- transaction support through `em.transactional(...)`
- native joins intentionally deferred

## Test

```bash
pnpm test
```
