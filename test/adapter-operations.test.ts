import { describe, expect, test } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import {
  buildModelData,
  createAdapter,
  createBetterAuthTables,
  createInMemoryOrm,
} from "./helpers.js";

describe("mikroOrmAdapter operations", () => {
  test("supports findMany projections, sorting, offsets, updateMany, and deleteMany", async () => {
    const orm = await createInMemoryOrm();
    const options = {} as BetterAuthOptions;

    await createBetterAuthTables(orm, options);
    const adapter = createAdapter(options, orm);

    await adapter.create({
      model: "user",
      data: buildModelData(options, "user", {
        email: "alpha@example.com",
        name: "Alpha",
      }),
    });
    await adapter.create({
      model: "user",
      data: buildModelData(options, "user", {
        email: "beta@example.com",
        name: "Beta",
      }),
    });

    const projected = await adapter.findMany<{ email: string; name?: string }>({
      model: "user",
      limit: 1,
      select: ["email"],
      sortBy: {
        field: "email",
        direction: "asc",
      },
      offset: 1,
    });

    expect(projected).toHaveLength(1);
    expect(projected[0]?.email).toBe("beta@example.com");
    expect(projected[0]?.name).toBeUndefined();

    await adapter.create({
      model: "verification",
      data: buildModelData(options, "verification", {
        identifier: "shared",
        value: "one",
      }),
    });
    await adapter.create({
      model: "verification",
      data: buildModelData(options, "verification", {
        identifier: "shared",
        value: "two",
      }),
    });

    const updatedCount = await adapter.updateMany({
      model: "verification",
      where: [{ field: "identifier", operator: "eq", value: "shared" }],
      update: { value: "updated" },
    });

    expect(updatedCount).toBe(2);

    const updatedRows = await adapter.findMany<{ value: string }>({
      model: "verification",
      where: [{ field: "identifier", operator: "eq", value: "shared" }],
      limit: 10,
      sortBy: {
        field: "value",
        direction: "asc",
      },
    });

    expect(updatedRows).toHaveLength(2);
    expect(updatedRows.every((row) => row.value === "updated")).toBe(true);

    const deletedCount = await adapter.deleteMany({
      model: "verification",
      where: [{ field: "identifier", operator: "eq", value: "shared" }],
    });

    expect(deletedCount).toBe(2);

    await orm.close(true);
  });

  test("returns null when updating a missing record", async () => {
    const orm = await createInMemoryOrm();
    const options = {} as BetterAuthOptions;

    await createBetterAuthTables(orm, options);
    const adapter = createAdapter(options, orm);

    const updated = await adapter.update({
      model: "user",
      where: [{ field: "id", operator: "eq", value: "missing-id" }],
      update: { email: "missing@example.com" },
    });

    expect(updated).toBeNull();
    await orm.close(true);
  });

  test("findOne with select returns only the requested fields", async () => {
    const orm = await createInMemoryOrm();
    const options = {} as BetterAuthOptions;

    await createBetterAuthTables(orm, options);
    const adapter = createAdapter(options, orm);

    await adapter.create({
      model: "user",
      data: buildModelData(options, "user", {
        email: "select@example.com",
        name: "SelectUser",
      }),
    });

    const found = await adapter.findOne<{ email: string; name?: string }>({
      model: "user",
      where: [{ field: "email", operator: "eq", value: "select@example.com" }],
      select: ["email"],
    });

    expect(found).not.toBeNull();
    expect(found?.email).toBe("select@example.com");
  });
});
