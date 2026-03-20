import type { CleanedWhere } from "better-auth/adapters";
import type { SqlEntityManager } from "@mikro-orm/knex";

export type QueryBuilderLike = {
  andWhere?: (...args: any[]) => QueryBuilderLike;
  orWhere?: (...args: any[]) => QueryBuilderLike;
  andWhereIn?: (...args: any[]) => QueryBuilderLike;
  orWhereIn?: (...args: any[]) => QueryBuilderLike;
  andWhereNotIn?: (...args: any[]) => QueryBuilderLike;
  orWhereNotIn?: (...args: any[]) => QueryBuilderLike;
  andWhereNull?: (...args: any[]) => QueryBuilderLike;
  orWhereNull?: (...args: any[]) => QueryBuilderLike;
  andWhereNotNull?: (...args: any[]) => QueryBuilderLike;
  orWhereNotNull?: (...args: any[]) => QueryBuilderLike;
  transacting?: (...args: any[]) => QueryBuilderLike;
  first?: () => Promise<Record<string, unknown> | undefined>;
  select?: (...args: any[]) => QueryBuilderLike;
  orderBy?: (...args: any[]) => QueryBuilderLike;
  limit?: (...args: any[]) => QueryBuilderLike;
  offset?: (...args: any[]) => QueryBuilderLike;
  insert?: (...args: any[]) => QueryBuilderLike;
  returning?: (...args: any[]) => QueryBuilderLike;
  update?: (...args: any[]) => Promise<number>;
  delete?: (...args: any[]) => Promise<number>;
  count?: (...args: any[]) => QueryBuilderLike;
};

export function buildTableQuery(model: string, em: SqlEntityManager) {
  const qb = em.getKnex()(model) as QueryBuilderLike;
  const transactionContext = em.getTransactionContext();

  if (transactionContext && typeof qb.transacting === "function") {
    qb.transacting(transactionContext);
  }

  return qb;
}

export function applyWhere(
  query: QueryBuilderLike,
  where: CleanedWhere[] | undefined,
) {
  if (!where || where.length === 0) {
    return query;
  }

  where.forEach((condition, index) => {
    const connector =
      index === 0
        ? "andWhere"
        : condition.connector === "OR"
          ? "orWhere"
          : "andWhere";
    const field = condition.field;
    const value = condition.value;

    switch (condition.operator) {
      case "in": {
        const method = connector === "orWhere" ? "orWhereIn" : "andWhereIn";
        (query[method] as Function)?.call(
          query,
          field,
          Array.isArray(value) ? value : [value],
        );
        break;
      }
      case "not_in": {
        const method =
          connector === "orWhere" ? "orWhereNotIn" : "andWhereNotIn";
        (query[method] as Function)?.call(
          query,
          field,
          Array.isArray(value) ? value : [value],
        );
        break;
      }
      case "contains":
        (query[connector] as Function)?.call(
          query,
          field,
          "like",
          `%${value}%`,
        );
        break;
      case "starts_with":
        (query[connector] as Function)?.call(query, field, "like", `${value}%`);
        break;
      case "ends_with":
        (query[connector] as Function)?.call(query, field, "like", `%${value}`);
        break;
      case "ne":
        if (value === null) {
          const method =
            connector === "orWhere" ? "orWhereNotNull" : "andWhereNotNull";
          (query[method] as Function)?.call(query, field);
        } else {
          (query[connector] as Function)?.call(query, field, "<>", value);
        }
        break;
      case "gt":
        (query[connector] as Function)?.call(query, field, ">", value);
        break;
      case "gte":
        (query[connector] as Function)?.call(query, field, ">=", value);
        break;
      case "lt":
        (query[connector] as Function)?.call(query, field, "<", value);
        break;
      case "lte":
        (query[connector] as Function)?.call(query, field, "<=", value);
        break;
      case "eq":
      default:
        if (value === null) {
          const method =
            connector === "orWhere" ? "orWhereNull" : "andWhereNull";
          (query[method] as Function)?.call(query, field);
        } else {
          (query[connector] as Function)?.call(query, field, "=", value);
        }
        break;
    }
  });

  return query;
}
