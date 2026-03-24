import { describe, expect, test } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import { mikroOrmAdapter } from "../src/index.js";

type MockQuery = Record<string, (...args: any[]) => any>;

function createQueuedEntityManager(queries: MockQuery[]) {
  const queue = [...queries];
  type QueuedEntityManager = {
    getKnex: () => () => MockQuery;
    getTransactionContext: () => null;
    transactional: <T>(
      callback: (em: QueuedEntityManager) => Promise<T>,
    ) => Promise<T>;
  };

  const entityManager: QueuedEntityManager = {
    getKnex: () => () => {
      const next = queue.shift();

      if (!next) {
        throw new Error("No queued query available.");
      }

      return next;
    },
    getTransactionContext: () => null,
    transactional: async <T>(
      callback: (em: typeof entityManager) => Promise<T>,
    ) => callback(entityManager),
  };

  return entityManager;
}

function createSelectQuery(result: Record<string, unknown> | null) {
  const query = {
    select: () => query,
    first: async () => result ?? undefined,
  };

  return query;
}

describe("mikroOrmAdapter fallback branches", () => {
  test("re-reads inserted rows by explicit id when returning data is empty", async () => {
    const entityManager = createQueuedEntityManager([
      {
        insert: () => ({
          returning: async () => [],
        }),
      },
      createSelectQuery({
        id: "user-1",
        email: "user-1@example.com",
      }),
    ]);
    const adapter = mikroOrmAdapter(() => entityManager as never)(
      {} as BetterAuthOptions,
    );

    const created = await adapter.create({
      model: "user",
      data: {
        id: "user-1",
        email: "user-1@example.com",
      },
      forceAllowId: true,
      select: ["email"],
    });

    expect(created).toEqual({
      email: "user-1@example.com",
    });
  });

  test("re-reads updates with the original where clause when the current row has no id", async () => {
    const entityManager = createQueuedEntityManager([
      createSelectQuery({
        email: "before@example.com",
      }),
      {
        update: async () => 1,
      },
      createSelectQuery({
        email: "after@example.com",
      }),
    ]);
    const adapter = mikroOrmAdapter(() => entityManager as never)(
      {} as BetterAuthOptions,
    );

    const updated = await adapter.update({
      model: "user",
      where: [{ field: "email", operator: "eq", value: "before@example.com" }],
      update: {
        email: "after@example.com",
      },
    });

    expect(updated).toEqual({
      email: "after@example.com",
    });
  });
});
