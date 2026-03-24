import { betterAuth } from "better-auth";
import { MikroORM } from "@mikro-orm/core";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { mikroOrmAdapter } from "../../src/index.js";

const orm = await MikroORM.init<SqliteDriver>({
  driver: SqliteDriver,
  dbName: ":memory:",
  entities: [],
  discovery: {
    warnWhenNoEntities: false,
  },
  allowGlobalContext: true,
});

export const auth = betterAuth({
  user: {
    modelName: "members",
    fields: {
      name: "display_name",
      email: "email_address",
    },
  },
  database: mikroOrmAdapter(() => orm.em),
});
