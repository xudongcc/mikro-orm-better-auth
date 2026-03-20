import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MikroORM } from "@mikro-orm/core";
import { SqliteDriver } from "@mikro-orm/sqlite";
import type { Knex } from "@mikro-orm/knex";
import type { BetterAuthOptions } from "better-auth";
import {
  getAuthTables,
  type BetterAuthDBSchema,
  type DBFieldAttribute,
} from "better-auth/db";
import { mikroOrmAdapter } from "../src/index.js";

const repoTmpDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "tmp",
);

export async function createInMemoryOrm() {
  return MikroORM.init<SqliteDriver>({
    driver: SqliteDriver,
    dbName: ":memory:",
    entities: [],
    discovery: {
      warnWhenNoEntities: false,
    },
    allowGlobalContext: true,
  });
}

export async function createBetterAuthTables(
  orm: MikroORM<SqliteDriver>,
  options: BetterAuthOptions,
) {
  const knex = orm.em.getKnex();
  const tables = getAuthTables(options);
  const ordered = Object.entries(tables).sort(([, left], [, right]) => {
    return (
      (left.order ?? Number.MAX_SAFE_INTEGER) -
      (right.order ?? Number.MAX_SAFE_INTEGER)
    );
  });

  for (const [, table] of ordered) {
    const exists = await knex.schema.hasTable(table.modelName);
    if (exists) {
      continue;
    }

    await knex.schema.createTable(table.modelName, (builder) => {
      builder.text("id").primary();

      for (const [fieldName, field] of Object.entries(table.fields)) {
        const columnName = field.fieldName ?? fieldName;
        const column = addColumn(builder, columnName, field);

        if (field.required !== false) {
          column.notNullable();
        } else {
          column.nullable();
        }

        if (field.unique) {
          column.unique();
        }

        if (field.index) {
          column.index();
        }

        if (field.references) {
          const referencedModel =
            tables[field.references.model]?.modelName ?? field.references.model;
          const referencedField =
            tables[field.references.model]?.fields[field.references.field]
              ?.fieldName ?? field.references.field;

          column
            .references(referencedField)
            .inTable(referencedModel)
            .onDelete(toKnexDeleteRule(field.references.onDelete));
        }
      }
    });
  }
}

export function createAdapter(
  options: BetterAuthOptions,
  orm: MikroORM<SqliteDriver>,
) {
  return mikroOrmAdapter(orm.em)(options);
}

export function buildModelData(
  options: BetterAuthOptions,
  model: keyof BetterAuthDBSchema,
  overrides: Record<string, unknown> = {},
) {
  const tables = getAuthTables(options);
  const table = tables[model];

  if (!table) {
    throw new Error(`Unknown Better Auth model: ${String(model)}`);
  }

  const data: Record<string, unknown> = {};

  for (const [fieldName, field] of Object.entries(table.fields)) {
    if (field.input === false) {
      continue;
    }

    if (overrides[fieldName] !== undefined) {
      data[fieldName] = overrides[fieldName];
      continue;
    }

    data[fieldName] = sampleValueForField(fieldName, field);
  }

  return {
    ...data,
    ...overrides,
  };
}

export async function createTempDir(prefix: string) {
  await fs.mkdir(repoTmpDir, { recursive: true });
  return fs.mkdtemp(path.join(repoTmpDir, prefix));
}

function addColumn(
  builder: Knex.CreateTableBuilder,
  columnName: string,
  field: DBFieldAttribute,
) {
  switch (field.type) {
    case "number":
      return field.bigint
        ? builder.bigInteger(columnName)
        : builder.integer(columnName);
    case "boolean":
      return builder.integer(columnName);
    case "date":
    case "json":
    case "string[]":
    case "number[]":
      return builder.text(columnName);
    case "string":
    default:
      return builder.text(columnName);
  }
}

function sampleValueForField(fieldName: string, field: DBFieldAttribute) {
  if (typeof field.defaultValue === "function") {
    return field.defaultValue();
  }

  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  switch (field.type) {
    case "number":
      return 1;
    case "boolean":
      return false;
    case "date":
      return new Date("2024-01-01T00:00:00.000Z");
    case "json":
      return { field: fieldName };
    case "string[]":
      return [fieldName];
    case "number[]":
      return [1];
    case "string":
    default:
      if (fieldName.toLowerCase().includes("email")) {
        return "user@example.com";
      }

      if (fieldName.toLowerCase().includes("token")) {
        return `${fieldName}-token`;
      }

      return `${fieldName}-value`;
  }
}

function toKnexDeleteRule(
  rule?: "no action" | "restrict" | "cascade" | "set null" | "set default",
) {
  switch (rule) {
    case "set null":
      return "SET NULL";
    case "set default":
      return "SET DEFAULT";
    case "restrict":
      return "RESTRICT";
    case "no action":
      return "NO ACTION";
    case "cascade":
    default:
      return "CASCADE";
  }
}
