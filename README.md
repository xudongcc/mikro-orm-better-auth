# mikro-orm-better-auth

Better Auth adapter for MikroORM, with a `createSchema` implementation that generates MikroORM entity files via `ts-morph`.

## Install

```bash
pnpm add better-auth @mikro-orm/core @mikro-orm/knex ts-morph
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
- are rewritten deterministically on regeneration
- remove stale managed files from the output directory

## Scope

- SQL-oriented runtime adapter using MikroORM's SQL entity manager
- `create`, `update`, `updateMany`, `delete`, `deleteMany`, `findOne`, `findMany`, `count`
- transaction support through `em.transactional(...)`
- native joins intentionally deferred

## Test

```bash
pnpm test
```
