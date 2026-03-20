import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ClassDeclaration,
  Project,
  PropertyDeclaration,
  QuoteKind,
  ScriptTarget,
  SourceFile,
  ts,
} from "ts-morph";
import type { BetterAuthOptions } from "better-auth";
import type { DBAdapterSchemaCreation } from "better-auth/adapters";
import type {
  BetterAuthDBSchema,
  DBFieldAttribute,
  DBFieldType,
} from "better-auth/db";
import type { MikroOrmGenerateEntityConfig } from "../types.js";
import { escapeString, toKebabCase, toPascalCase } from "./string.js";

const MIKRO_ORM_IMPORTS = ["Entity", "PrimaryKey", "Property"] as const;
const MANAGED_DECORATOR_NAMES = new Set(["Entity", "PrimaryKey", "Property"]);

export const DEFAULT_OUTPUT_DIR = "src/auth/entities";

type ManagedDecoratorDefinition = {
  name: "Entity" | "PrimaryKey" | "Property";
  arguments: string[];
};

type ManagedPropertyDefinition = {
  name: string;
  type: string;
  hasQuestionToken: boolean;
  hasExclamationToken: boolean;
  initializer?: string;
  decorator: ManagedDecoratorDefinition;
};

type ManagedEntityDefinition = {
  className: string;
  classDecorator: ManagedDecoratorDefinition;
  properties: ManagedPropertyDefinition[];
};

export async function generateEntityFiles({
  file,
  tables,
  options,
  generateEntityConfig,
}: {
  file?: string;
  tables: BetterAuthDBSchema;
  options: BetterAuthOptions;
  generateEntityConfig?: MikroOrmGenerateEntityConfig;
}): Promise<DBAdapterSchemaCreation> {
  const generation = resolveGenerationPaths(file, generateEntityConfig);

  await fs.mkdir(generation.outputDir, { recursive: true });

  const project = new Project({
    compilerOptions: {
      target: ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
    },
    useInMemoryFileSystem: false,
  });

  const generatedPaths: string[] = [];
  const sortedTables = Object.entries(tables).sort(([, left], [, right]) => {
    return (
      (left.order ?? Number.MAX_SAFE_INTEGER) -
      (right.order ?? Number.MAX_SAFE_INTEGER)
    );
  });

  for (const [modelKey, table] of sortedTables) {
    const entityPath = path.join(
      generation.outputDir,
      toEntityFileName(modelKey),
    );
    const entityDefinition = createManagedEntityDefinition(
      modelKey,
      table,
      options,
    );
    const exists = await fileExists(entityPath);

    generatedPaths.push(entityPath);

    if (exists) {
      const sourceFile = project.addSourceFileAtPath(entityPath);

      patchEntitySourceFile({
        sourceFile,
        filePath: entityPath,
        entityDefinition,
      });
      continue;
    }

    const sourceFile = project.createSourceFile(entityPath, "", {
      overwrite: true,
    });

    renderEntitySourceFile(sourceFile, entityDefinition);
    finalizeSourceFile(sourceFile);
  }

  await project.save();

  const primaryPath = generatedPaths[0];

  if (!primaryPath) {
    throw new Error("No Better Auth entities were generated.");
  }

  const code = await fs.readFile(primaryPath, "utf8");

  return {
    path: primaryPath,
    code,
    overwrite: true,
  };
}

function createManagedEntityDefinition(
  modelKey: string,
  table: BetterAuthDBSchema[string],
  options: BetterAuthOptions,
): ManagedEntityDefinition {
  const className = toPascalCase(modelKey);
  const generateIdMode = options.advanced?.database?.generateId;
  const properties: ManagedPropertyDefinition[] = [
    {
      name: "id",
      type: generateIdMode === "serial" ? "number" : "string",
      hasQuestionToken: false,
      hasExclamationToken: true,
      decorator: {
        name: "PrimaryKey",
        arguments: [
          serializeDecoratorOptions({
            type: generateIdMode === "serial" ? "number" : "string",
            autoincrement: generateIdMode === "serial" ? true : undefined,
          }),
        ],
      },
    },
  ];

  for (const [fieldName, field] of Object.entries(table.fields)) {
    const initializer = buildInitializer(field);

    properties.push({
      name: fieldName,
      type: mapFieldTypeToTypeScript(field.type),
      hasQuestionToken: field.required === false,
      hasExclamationToken:
        field.required !== false && initializer === undefined,
      initializer,
      decorator: {
        name: "Property",
        arguments: [
          serializeDecoratorOptions(toPropertyOptions(field, fieldName)),
        ],
      },
    });
  }

  return {
    className,
    classDecorator: {
      name: "Entity",
      arguments: [`{ tableName: '${table.modelName}' }`],
    },
    properties,
  };
}

function renderEntitySourceFile(
  sourceFile: SourceFile,
  entityDefinition: ManagedEntityDefinition,
) {
  reconcileManagedImport(sourceFile);

  const entityClass = sourceFile.addClass({
    name: entityDefinition.className,
    isExported: true,
  });

  reconcileManagedDecorator(entityClass, entityDefinition.classDecorator);

  for (const property of entityDefinition.properties) {
    entityClass.addProperty({
      name: property.name,
      type: property.type,
      hasQuestionToken: property.hasQuestionToken,
      hasExclamationToken: property.hasExclamationToken,
      initializer: property.initializer,
      decorators: [property.decorator],
    });
  }
}

function patchEntitySourceFile({
  sourceFile,
  filePath,
  entityDefinition,
}: {
  sourceFile: SourceFile;
  filePath: string;
  entityDefinition: ManagedEntityDefinition;
}) {
  reconcileManagedImport(sourceFile);

  const entityClass = getEntityClass(
    sourceFile,
    filePath,
    entityDefinition.className,
  );

  reconcileManagedDecorator(entityClass, entityDefinition.classDecorator);

  for (const property of entityDefinition.properties) {
    const existingProperty = entityClass.getProperty(property.name);

    if (existingProperty) {
      reconcileManagedProperty(existingProperty, property);
      continue;
    }

    const conflictingMember = findNamedClassMember(entityClass, property.name);
    if (conflictingMember) {
      throw new Error(
        `File at ${filePath} could not be patched safely because member '${property.name}' is not a property.`,
      );
    }

    entityClass.addProperty({
      name: property.name,
      type: property.type,
      hasQuestionToken: property.hasQuestionToken,
      hasExclamationToken: property.hasExclamationToken,
      initializer: property.initializer,
      decorators: [property.decorator],
    });
  }

  finalizeSourceFile(sourceFile);
}

function reconcileManagedImport(sourceFile: SourceFile) {
  const existingImport = sourceFile.getImportDeclaration("@mikro-orm/core");

  if (!existingImport) {
    sourceFile.insertImportDeclaration(0, {
      moduleSpecifier: "@mikro-orm/core",
      namedImports: [...MIKRO_ORM_IMPORTS],
    });
    return;
  }

  const existingNamedImports = new Set(
    existingImport
      .getNamedImports()
      .map((namedImport) => namedImport.getName()),
  );

  for (const importName of MIKRO_ORM_IMPORTS) {
    if (!existingNamedImports.has(importName)) {
      existingImport.addNamedImport(importName);
    }
  }
}

function getEntityClass(
  sourceFile: SourceFile,
  filePath: string,
  className: string,
) {
  const matchedClasses = sourceFile
    .getClasses()
    .filter((entityClass) => entityClass.getName() === className);

  if (matchedClasses.length !== 1) {
    throw new Error(
      `File at ${filePath} could not be patched safely because it does not contain exactly one exported '${className}' entity class.`,
    );
  }

  const [entityClass] = matchedClasses;

  if (!entityClass?.isExported()) {
    throw new Error(
      `File at ${filePath} could not be patched safely because '${className}' is not exported.`,
    );
  }

  return entityClass;
}

function reconcileManagedDecorator(
  node: ClassDeclaration | PropertyDeclaration,
  managedDecorator: ManagedDecoratorDefinition,
) {
  node
    .getDecorators()
    .filter((decorator) => MANAGED_DECORATOR_NAMES.has(decorator.getName()))
    .forEach((decorator) => decorator.remove());

  node.insertDecorator(0, managedDecorator);
}

function reconcileManagedProperty(
  property: PropertyDeclaration,
  definition: ManagedPropertyDefinition,
) {
  property.setType(definition.type);
  property.setHasQuestionToken(definition.hasQuestionToken);
  property.setHasExclamationToken(definition.hasExclamationToken);

  if (definition.initializer === undefined) {
    property.removeInitializer();
  } else {
    property.setInitializer(definition.initializer);
  }

  reconcileManagedDecorator(property, definition.decorator);
}

function findNamedClassMember(
  entityClass: ClassDeclaration,
  memberName: string,
) {
  return entityClass.getMembers().find((member) => {
    const namedMember = member as { getName?: () => string | undefined };
    return namedMember.getName?.() === memberName;
  });
}

function finalizeSourceFile(sourceFile: SourceFile) {
  sourceFile.formatText({
    indentSize: 2,
    convertTabsToSpaces: true,
    semicolons: ts.SemicolonPreference.Insert,
  });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function resolveGenerationPaths(
  file: string | undefined,
  generateEntityConfig: MikroOrmGenerateEntityConfig | undefined,
) {
  if (!file) {
    const outputDir = path.resolve(
      generateEntityConfig?.outputDir ?? DEFAULT_OUTPUT_DIR,
    );
    return {
      outputDir,
    };
  }

  const resolved = path.resolve(file);

  if (path.extname(resolved)) {
    return {
      outputDir: path.dirname(resolved),
    };
  }

  return {
    outputDir: resolved,
  };
}

function toPropertyOptions(field: DBFieldAttribute, fieldName: string) {
  return {
    fieldName:
      field.fieldName && field.fieldName !== fieldName
        ? field.fieldName
        : undefined,
    type: mapFieldTypeToMikroOrm(field.type),
    nullable: field.required === false ? true : undefined,
    unique: field.unique ? true : undefined,
    index: field.index ? true : undefined,
    default: buildDefaultOption(field),
    onCreate: buildOnCreateOption(field),
    onUpdate: buildOnUpdateOption(field),
  };
}

function buildDefaultOption(field: DBFieldAttribute) {
  if (typeof field.defaultValue === "string") {
    return field.defaultValue;
  }

  if (
    typeof field.defaultValue === "number" ||
    typeof field.defaultValue === "boolean"
  ) {
    return field.defaultValue;
  }

  return undefined;
}

function buildInitializer(field: DBFieldAttribute) {
  if (typeof field.defaultValue === "string") {
    return `'${escapeString(field.defaultValue)}'`;
  }

  if (
    typeof field.defaultValue === "number" ||
    typeof field.defaultValue === "boolean"
  ) {
    return String(field.defaultValue);
  }

  if (field.type === "date" && field.defaultValue !== undefined) {
    return "new Date()";
  }

  return undefined;
}

function buildOnCreateOption(field: DBFieldAttribute) {
  if (field.type !== "date" || field.defaultValue === undefined) {
    return undefined;
  }

  return "() => new Date()";
}

function buildOnUpdateOption(field: DBFieldAttribute) {
  if (field.type !== "date" || !field.onUpdate) {
    return undefined;
  }

  return "() => new Date()";
}

function serializeDecoratorOptions(options: Record<string, unknown>) {
  const parts = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${serializeDecoratorValue(value)}`);

  return parts.length > 0 ? `{ ${parts.join(", ")} }` : "{}";
}

function serializeDecoratorValue(value: unknown): string {
  if (typeof value === "string") {
    if (value.startsWith("() => ")) {
      return value;
    }

    if (value === "Date") {
      return "Date";
    }

    return `'${escapeString(value)}'`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return JSON.stringify(value);
}

function mapFieldTypeToTypeScript(type: DBFieldType) {
  if (Array.isArray(type)) {
    return "string";
  }

  switch (type) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "Date";
    case "json":
      return "Record<string, unknown> | unknown[]";
    case "string[]":
      return "string[]";
    case "number[]":
      return "number[]";
    case "string":
    default:
      return "string";
  }
}

function mapFieldTypeToMikroOrm(type: DBFieldType) {
  if (Array.isArray(type)) {
    return "string";
  }

  switch (type) {
    case "date":
      return "Date";
    case "json":
    case "string[]":
    case "number[]":
      return "json";
    default:
      return type;
  }
}

function toEntityFileName(modelKey: string) {
  return `${toKebabCase(modelKey)}.entity.ts`;
}
