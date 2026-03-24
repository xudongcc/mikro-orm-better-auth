import { describe, expect, test } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import { createTestSuite, testAdapter } from "@better-auth/test-utils/adapter";
import { mikroOrmAdapter } from "../src/index.js";
import {
  buildModelData,
  createAdapter,
  createBetterAuthTables,
  createInMemoryOrm,
} from "./helpers.js";

const basicCrudSuite = createTestSuite(
  "mikro-orm adapter contract",
  {
    alwaysMigrate: false,
  },
  ({ adapter, insertRandom, tryCatch }) => ({
    async "creates and reads a user"() {
      const [user] = await insertRandom("user");
      const found = await adapter.findOne<typeof user>({
        model: "user",
        where: [{ field: "id", value: user.id }],
      });

      expect(found?.id).toBe(user.id);
    },
    async "updates and deletes a session"() {
      const [, session] = await insertRandom("session");
      const updated = await adapter.update<{ token: string }>({
        model: "session",
        where: [{ field: "id", value: session.id }],
        update: { token: "updated-token" },
      });

      expect(updated?.token).toBe("updated-token");

      await adapter.delete({
        model: "session",
        where: [{ field: "id", value: session.id }],
      });

      const deleted = await adapter.findOne({
        model: "session",
        where: [{ field: "id", value: session.id }],
      });

      expect(deleted).toBeNull();
    },
    async "counts records after bulk insert"() {
      await insertRandom("verification", 2);
      const result = await tryCatch(
        adapter.count({
          model: "verification",
          where: [],
        }),
      );

      expect(result.error).toBeNull();
      expect(result.data).toBeGreaterThanOrEqual(2);
    },
  }),
);

const contractOrm = await createInMemoryOrm();
const contractRunner = await testAdapter({
  adapter: async () => mikroOrmAdapter(() => contractOrm.em),
  runMigrations: async (options) => {
    await createBetterAuthTables(contractOrm, options);
  },
  tests: [basicCrudSuite()],
  onFinish: async () => {
    await contractOrm.close(true);
  },
});

contractRunner.execute();

describe("mikroOrmAdapter", () => {
  test("uses transformed table and field names", async () => {
    const orm = await createInMemoryOrm();
    const options = {
      user: {
        modelName: "members",
        fields: {
          name: "display_name",
        },
      },
    } as BetterAuthOptions;

    await createBetterAuthTables(orm, options);
    const adapter = createAdapter(options, orm);

    const created = await adapter.create<Record<string, unknown>>({
      model: "user",
      data: buildModelData(options, "user", {
        name: "Ada Lovelace",
        email: "ada@example.com",
      }),
    });

    const rawUser = await orm.em.getKnex()("members").select("*").first();

    expect(created.name).toBe("Ada Lovelace");
    expect(rawUser.display_name).toBe("Ada Lovelace");

    await orm.close(true);
  });

  test("rolls back transactions", async () => {
    const orm = await createInMemoryOrm();
    const options = {} as BetterAuthOptions;

    await createBetterAuthTables(orm, options);
    const adapter = createAdapter(options, orm);

    await expect(
      adapter.transaction(async (trx) => {
        await trx.create({
          model: "user",
          data: buildModelData(options, "user", {
            email: "rollback@example.com",
          }),
        });

        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const count = await adapter.count({
      model: "user",
      where: [
        { field: "email", operator: "eq", value: "rollback@example.com" },
      ],
    });

    expect(count).toBe(0);
    await orm.close(true);
  });
});
