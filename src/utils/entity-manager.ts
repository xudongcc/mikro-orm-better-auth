import { SqlEntityManager } from "@mikro-orm/knex";

export function normalizeEntityManager(em: SqlEntityManager) {
  if (!em || typeof em.getKnex !== "function") {
    throw new TypeError("mikroOrmAdapter expected a SqlEntityManager.");
  }

  return em;
}
