import { describe, expect, test } from "vitest";
import { normalizeEntityManager } from "../src/utils/entity-manager.js";
import {
  normalizeAffectedRows,
  normalizeCount,
} from "../src/utils/normalize.js";
import {
  applyWhere,
  buildTableQuery,
  type QueryBuilderLike,
} from "../src/utils/query.js";
import {
  escapeString,
  toKebabCase,
  toPascalCase,
} from "../src/utils/string.js";

function createRecordingQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: QueryBuilderLike & { calls: typeof calls } = {
    calls,
    andWhere: (...args) => {
      calls.push({ method: "andWhere", args });
      return query;
    },
    orWhere: (...args) => {
      calls.push({ method: "orWhere", args });
      return query;
    },
    andWhereIn: (...args) => {
      calls.push({ method: "andWhereIn", args });
      return query;
    },
    orWhereIn: (...args) => {
      calls.push({ method: "orWhereIn", args });
      return query;
    },
    andWhereNotIn: (...args) => {
      calls.push({ method: "andWhereNotIn", args });
      return query;
    },
    orWhereNotIn: (...args) => {
      calls.push({ method: "orWhereNotIn", args });
      return query;
    },
    andWhereNull: (...args) => {
      calls.push({ method: "andWhereNull", args });
      return query;
    },
    orWhereNull: (...args) => {
      calls.push({ method: "orWhereNull", args });
      return query;
    },
    andWhereNotNull: (...args) => {
      calls.push({ method: "andWhereNotNull", args });
      return query;
    },
    orWhereNotNull: (...args) => {
      calls.push({ method: "orWhereNotNull", args });
      return query;
    },
    transacting: (...args) => {
      calls.push({ method: "transacting", args });
      return query;
    },
  };

  return query;
}

describe("utility helpers", () => {
  test("normalizes SQL entity managers", () => {
    const entityManager = {
      getKnex: () => () => ({}),
    };

    expect(normalizeEntityManager(entityManager as never)).toBe(entityManager);
  });

  test("throws for invalid SQL entity managers", () => {
    expect(() => normalizeEntityManager({} as never)).toThrow(
      "mikroOrmAdapter expected a SqlEntityManager.",
    );
  });

  test("normalizes affected row counts and count rows", () => {
    expect(normalizeAffectedRows(2)).toBe(2);
    expect(normalizeAffectedRows([3])).toBe(3);
    expect(normalizeAffectedRows("nope")).toBe(0);

    expect(normalizeCount(undefined)).toBe(0);
    expect(normalizeCount({ count: 4 })).toBe(4);
    expect(normalizeCount({ count: 5n })).toBe(5);
    expect(normalizeCount({ count: "6" })).toBe(6);
    expect(normalizeCount({ other: true })).toBe(0);
  });

  test("converts strings and escapes quotes", () => {
    expect(toPascalCase("better-auth_user")).toBe("BetterAuthUser");
    expect(toPascalCase("mixedCaseName")).toBe("MixedCaseName");
    expect(toKebabCase("better-auth_user")).toBe("better-auth-user");
    expect(toKebabCase("mixedCaseName")).toBe("mixed-case-name");
    expect(escapeString("it's \\ working")).toBe("it\\'s \\\\ working");
  });

  test("buildTableQuery attaches transaction contexts when present", () => {
    const query = createRecordingQuery();
    const entityManager = {
      getKnex: () => () => query,
      getTransactionContext: () => "trx-id",
    };

    const builtQuery = buildTableQuery("users", entityManager as never);

    expect(builtQuery).toBe(query);
    expect(query.calls).toContainEqual({
      method: "transacting",
      args: ["trx-id"],
    });
  });

  test("applyWhere leaves queries untouched when no conditions are provided", () => {
    const query = createRecordingQuery();

    expect(applyWhere(query, undefined)).toBe(query);
    expect(applyWhere(query, [])).toBe(query);
    expect(query.calls).toHaveLength(0);
  });

  test("applyWhere maps all supported operators to query builder calls", () => {
    const query = createRecordingQuery();

    applyWhere(query, [
      { connector: "AND", field: "id", operator: "eq", value: "1" },
      { connector: "OR", field: "deletedAt", operator: "eq", value: null },
      { connector: "AND", field: "status", operator: "ne", value: "archived" },
      { connector: "OR", field: "publishedAt", operator: "ne", value: null },
      {
        connector: "AND",
        field: "role",
        operator: "in",
        value: ["admin", "user"],
      },
      { connector: "OR", field: "team", operator: "in", value: "core" },
      { connector: "AND", field: "region", operator: "not_in", value: ["cn"] },
      { connector: "OR", field: "env", operator: "not_in", value: "dev" },
      { connector: "AND", field: "name", operator: "contains", value: "Ada" },
      {
        connector: "OR",
        field: "slug",
        operator: "starts_with",
        value: "mikro",
      },
      {
        connector: "AND",
        field: "domain",
        operator: "ends_with",
        value: ".com",
      },
      { connector: "OR", field: "score", operator: "gt", value: 1 },
      { connector: "AND", field: "level", operator: "gte", value: 2 },
      { connector: "OR", field: "rank", operator: "lt", value: 3 },
      { connector: "AND", field: "tier", operator: "lte", value: 4 },
      {
        connector: "OR",
        field: "fallback",
        operator: "unknown" as never,
        value: "x",
      },
    ]);

    expect(query.calls).toEqual([
      { method: "andWhere", args: ["id", "=", "1"] },
      { method: "orWhereNull", args: ["deletedAt"] },
      { method: "andWhere", args: ["status", "<>", "archived"] },
      { method: "orWhereNotNull", args: ["publishedAt"] },
      { method: "andWhereIn", args: ["role", ["admin", "user"]] },
      { method: "orWhereIn", args: ["team", ["core"]] },
      { method: "andWhereNotIn", args: ["region", ["cn"]] },
      { method: "orWhereNotIn", args: ["env", ["dev"]] },
      { method: "andWhere", args: ["name", "like", "%Ada%"] },
      { method: "orWhere", args: ["slug", "like", "mikro%"] },
      { method: "andWhere", args: ["domain", "like", "%.com"] },
      { method: "orWhere", args: ["score", ">", 1] },
      { method: "andWhere", args: ["level", ">=", 2] },
      { method: "orWhere", args: ["rank", "<", 3] },
      { method: "andWhere", args: ["tier", "<=", 4] },
      { method: "orWhere", args: ["fallback", "=", "x"] },
    ]);
  });
});
