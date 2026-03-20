import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import type { BetterAuthDBSchema } from "better-auth/db";
import {
  DEFAULT_OUTPUT_DIR,
  generateEntityFiles,
  MANAGED_FILE_HEADER,
} from "../src/utils/schema-generator.js";
import { createTempDir } from "./helpers.js";

const originalCwd = process.cwd();
const execFileAsync = promisify(execFile);

afterEach(() => {
  process.chdir(originalCwd);
});

describe("schema generator utilities", () => {
  test("generates entity files for a directory target with custom settings", async () => {
    const workspaceDir = await createTempDir("mikro-orm-better-auth-schema-");
    const outputDir = path.join(workspaceDir, "entities");
    const tables = {
      report: {
        modelName: "reports",
        order: 1,
        fields: {
          title: {
            type: "string",
            defaultValue: "draft",
            unique: true,
            index: true,
            fieldName: "report_title",
          },
          score: {
            type: "number",
          },
          active: {
            type: "boolean",
            defaultValue: false,
          },
          createdAt: {
            type: "date",
            defaultValue: () => new Date(),
          },
          updatedAt: {
            type: "date",
            required: false,
            onUpdate: () => new Date(),
          },
          metadata: {
            type: "json",
            required: false,
          },
          tags: {
            type: "string[]",
            required: false,
          },
          scores: {
            type: "number[]",
            required: false,
          },
        },
      },
    } satisfies BetterAuthDBSchema;

    const result = await generateEntityFiles({
      file: outputDir,
      tables,
      options: {
        advanced: {
          database: {
            generateId: "serial",
          },
        },
      } as BetterAuthOptions,
      generateEntityConfig: {
        managedComment: "/* managed by tests */",
      },
    });

    const entityFile = path.join(outputDir, "report.entity.ts");
    const entityCode = await fs.readFile(entityFile, "utf8");

    expect(result.path).toBe(entityFile);
    expect(result.overwrite).toBe(true);
    expect(result.code).toContain("/* managed by tests */");
    expect(entityCode).toContain("/* managed by tests */");
    expect(entityCode).toContain(
      "@PrimaryKey({ type: 'number', autoincrement: true })",
    );
    expect(entityCode).toContain("fieldName: 'report_title'");
    expect(entityCode).toContain("nullable: true");
    expect(entityCode).toContain("unique: true");
    expect(entityCode).toContain("index: true");
    expect(entityCode).toContain("default: 'draft'");
    expect(entityCode).toContain("default: false");
    expect(entityCode).toContain("onCreate: () => new Date()");
    expect(entityCode).toContain("onUpdate: () => new Date()");
    expect(entityCode).toContain(
      "metadata?: Record<string, unknown> | unknown[];",
    );
    expect(entityCode).toContain("tags?: string[];");
    expect(entityCode).toContain("scores?: number[];");
    expect(entityCode).toContain("createdAt: Date = new Date();");

    await expectGeneratedFilesToTypecheck(workspaceDir);
  });

  test("uses the default output directory when no file path is provided", async () => {
    const workspaceDir = await createTempDir(
      "mikro-orm-better-auth-default-schema-",
    );
    process.chdir(workspaceDir);

    const result = await generateEntityFiles({
      tables: {
        user: {
          modelName: "users",
          fields: {
            email: {
              type: "string",
            },
          },
        },
      },
      options: {} as BetterAuthOptions,
    });

    const expectedPath = path.join(
      workspaceDir,
      DEFAULT_OUTPUT_DIR,
      "user.entity.ts",
    );
    const entityFile = path.join(
      workspaceDir,
      DEFAULT_OUTPUT_DIR,
      "user.entity.ts",
    );

    expect(await fs.realpath(result.path)).toBe(
      await fs.realpath(expectedPath),
    );
    await expect(fs.stat(entityFile)).resolves.toBeDefined();
  });

  test("refuses to overwrite unmanaged files and keeps unmanaged files during cleanup", async () => {
    const outputDir = await createTempDir("mikro-orm-better-auth-unmanaged-");
    const tableSchema = {
      user: {
        modelName: "users",
        fields: {
          email: {
            type: "string",
          },
        },
      },
    } satisfies BetterAuthDBSchema;
    const managedStaleFile = path.join(outputDir, "Stale.ts");
    const unmanagedFile = path.join(outputDir, "Keep.ts");
    const unmanagedTarget = path.join(outputDir, "user.entity.ts");

    await fs.writeFile(
      managedStaleFile,
      `${MANAGED_FILE_HEADER}\nexport class Stale {}`,
      "utf8",
    );
    await fs.writeFile(unmanagedFile, "export const keep = true;\n", "utf8");
    await fs.writeFile(unmanagedTarget, "export class User {}\n", "utf8");

    await expect(
      generateEntityFiles({
        file: outputDir,
        tables: tableSchema,
        options: {} as BetterAuthOptions,
      }),
    ).rejects.toThrow(
      `Refusing to overwrite unmanaged file at ${unmanagedTarget}`,
    );

    await fs.writeFile(
      unmanagedTarget,
      `${MANAGED_FILE_HEADER}\nexport class User {}\n`,
      "utf8",
    );

    await generateEntityFiles({
      file: outputDir,
      tables: tableSchema,
      options: {} as BetterAuthOptions,
    });

    await expect(fs.stat(unmanagedFile)).resolves.toBeDefined();
    await expect(fs.stat(managedStaleFile)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

async function expectGeneratedFilesToTypecheck(workspaceDir: string) {
  const tsconfigPath = path.join(workspaceDir, "tsconfig.json");

  await fs.writeFile(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          noEmit: true,
          skipLibCheck: true,
          types: ["node"],
        },
        include: ["entities/**/*.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );

  await execFileAsync(
    process.execPath,
    [
      path.join(originalCwd, "node_modules/typescript/bin/tsc"),
      "--project",
      tsconfigPath,
    ],
    {
      cwd: workspaceDir,
    },
  );
}
