import type { BetterAuthOptions } from "better-auth";
import {
  createAdapterFactory,
  type AdapterFactoryConfig,
  type CleanedWhere,
  type CustomAdapter,
} from "better-auth/adapters";
import { SqlEntityManager } from "@mikro-orm/knex";
import type { MikroOrmAdapterConfig } from "./types.js";
import { normalizeEntityManager } from "./utils/entity-manager.js";
import { normalizeAffectedRows, normalizeCount } from "./utils/normalize.js";
import { applyWhere, buildTableQuery } from "./utils/query.js";
import { generateEntityFiles } from "./utils/schema-generator.js";

export type {
  MikroOrmAdapterConfig,
  MikroOrmGenerateEntityConfig,
} from "./types.js";

export function mikroOrmAdapter(
  em: SqlEntityManager,
  config: MikroOrmAdapterConfig = {},
) {
  const baseEntityManager = normalizeEntityManager(em);
  let lazyOptions: BetterAuthOptions | null = null;
  let adapterFactoryConfig: AdapterFactoryConfig | null = null;

  const createCustomAdapter =
    (getEntityManager: () => SqlEntityManager) =>
    ({
      getFieldName,
      options,
    }: Parameters<
      NonNullable<Parameters<typeof createAdapterFactory>[0]["adapter"]>
    >[0]): CustomAdapter => {
      const mapSelect = (model: string, select?: string[]) =>
        select?.map((field) => getFieldName({ model, field }));

      const findFirst = async (
        model: string,
        where: CleanedWhere[] | undefined,
        select?: string[],
      ) => {
        const em = getEntityManager();
        const query = applyWhere(buildTableQuery(model, em), where);
        const resolvedSelect = mapSelect(model, select);

        if (resolvedSelect && resolvedSelect.length > 0) {
          query.select?.(resolvedSelect);
        } else {
          query.select?.("*");
        }

        return (await query.first?.()) ?? null;
      };

      return {
        async create<T extends Record<string, any>>({
          model,
          data,
          select,
        }: {
          model: string;
          data: T;
          select?: string[];
        }) {
          const em = getEntityManager();
          const insertQuery = buildTableQuery(model, em)
            .insert?.(data)
            .returning?.("*");
          const inserted = insertQuery
            ? await (insertQuery as unknown as Promise<unknown[]>)
            : [];

          if (
            Array.isArray(inserted) &&
            inserted[0] &&
            typeof inserted[0] === "object"
          ) {
            return inserted[0] as T;
          }

          if ("id" in data && data.id !== undefined) {
            return (await findFirst(
              model,
              [
                {
                  connector: "AND",
                  field: "id",
                  operator: "eq",
                  value: data.id,
                },
              ],
              select,
            )) as T;
          }

          return (await findFirst(model, undefined, select)) as T;
        },
        async update<T>({
          model,
          where,
          update,
        }: {
          model: string;
          where: CleanedWhere[];
          update: T;
        }) {
          const current = (await findFirst(model, where)) as Record<
            string,
            unknown
          > | null;

          if (!current) {
            return null;
          }

          const em = getEntityManager();
          const query = applyWhere(buildTableQuery(model, em), where);
          await query.update?.(update);

          if (current.id !== undefined) {
            return (await findFirst(model, [
              {
                connector: "AND",
                field: "id",
                operator: "eq",
                value: current.id as
                  | string
                  | number
                  | boolean
                  | string[]
                  | number[]
                  | Date
                  | null,
              },
            ])) as T | null;
          }

          return (await findFirst(model, where)) as T | null;
        },
        async updateMany({ model, where, update }) {
          const em = getEntityManager();
          const query = applyWhere(buildTableQuery(model, em), where);
          const result = await query.update?.(update);

          return normalizeAffectedRows(result);
        },
        async findOne<T>({
          model,
          where,
          select,
        }: {
          model: string;
          where: CleanedWhere[];
          select?: string[];
        }) {
          return (await findFirst(model, where, select)) as T | null;
        },
        async findMany<T>({
          model,
          where,
          limit,
          select,
          sortBy,
          offset,
        }: {
          model: string;
          where?: CleanedWhere[];
          limit: number;
          select?: string[];
          sortBy?: {
            field: string;
            direction: "asc" | "desc";
          };
          offset?: number;
        }) {
          const em = getEntityManager();
          const query = applyWhere(buildTableQuery(model, em), where);
          const resolvedSelect = mapSelect(model, select);

          if (resolvedSelect && resolvedSelect.length > 0) {
            query.select?.(resolvedSelect);
          } else {
            query.select?.("*");
          }

          if (sortBy) {
            query.orderBy?.(
              getFieldName({ model, field: sortBy.field }),
              sortBy.direction,
            );
          }

          if (offset !== undefined) {
            query.offset?.(offset);
          }

          query.limit?.(limit);

          return (await (query as unknown as Promise<T[]>)) as T[];
        },
        async count({ model, where }) {
          const em = getEntityManager();
          const query = applyWhere(buildTableQuery(model, em), where);
          const row = await query.count?.({ count: "*" }).first?.();

          return normalizeCount(row);
        },
        async delete({ model, where }) {
          const em = getEntityManager();
          const query = applyWhere(buildTableQuery(model, em), where);
          await query.delete?.();
        },
        async deleteMany({ model, where }) {
          const em = getEntityManager();
          const query = applyWhere(buildTableQuery(model, em), where);
          const result = await query.delete?.();

          return normalizeAffectedRows(result);
        },
        async createSchema({ file, tables }) {
          return generateEntityFiles({
            file,
            tables,
            options,
            generateEntityConfig: config.generateEntity,
          });
        },
        options: {
          driver: "mikro-orm",
          nativeJoins: false,
        },
      };
    };

  const factory = createAdapterFactory({
    config: {
      adapterId: "mikro-orm",
      adapterName: "MikroORM Adapter",
      usePlural: config.usePlural ?? false,
      debugLogs: config.debugLogs ?? false,
      supportsNumericIds: config.supportsNumericIds ?? true,
      supportsUUIDs: config.supportsUUIDs ?? false,
      supportsJSON: config.supportsJSON ?? false,
      supportsDates: config.supportsDates ?? false,
      supportsBooleans: config.supportsBooleans ?? false,
      supportsArrays: config.supportsArrays ?? false,
      disableIdGeneration: config.disableIdGeneration ?? false,
      transaction: async <R>(
        callback: (
          trx: ReturnType<ReturnType<typeof createAdapterFactory>>,
        ) => Promise<R>,
      ) => {
        return baseEntityManager.transactional(async (trxEm) => {
          const transactionalFactory = createAdapterFactory({
            config: adapterFactoryConfig!,
            adapter: createCustomAdapter(() => trxEm as SqlEntityManager),
          });

          return callback(transactionalFactory(lazyOptions!));
        });
      },
    },
    adapter: createCustomAdapter(() => baseEntityManager),
  });

  adapterFactoryConfig = {
    adapterId: "mikro-orm",
    adapterName: "MikroORM Adapter",
    usePlural: config.usePlural ?? false,
    debugLogs: config.debugLogs ?? false,
    supportsNumericIds: config.supportsNumericIds ?? true,
    supportsUUIDs: config.supportsUUIDs ?? false,
    supportsJSON: config.supportsJSON ?? false,
    supportsDates: config.supportsDates ?? false,
    supportsBooleans: config.supportsBooleans ?? false,
    supportsArrays: config.supportsArrays ?? false,
    disableIdGeneration: config.disableIdGeneration ?? false,
    transaction: false,
  };

  return (options: BetterAuthOptions) => {
    lazyOptions = options;
    return factory(options);
  };
}
