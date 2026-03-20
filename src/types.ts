import type { DBAdapterDebugLogOption } from "better-auth/adapters";

export interface MikroOrmGenerateEntityConfig {
  outputDir?: string;
  managedComment?: string;
}

export interface MikroOrmAdapterConfig {
  usePlural?: boolean;
  debugLogs?: DBAdapterDebugLogOption;
  supportsNumericIds?: boolean;
  supportsUUIDs?: boolean;
  supportsJSON?: boolean;
  supportsDates?: boolean;
  supportsBooleans?: boolean;
  supportsArrays?: boolean;
  disableIdGeneration?: boolean;
  generateEntity?: MikroOrmGenerateEntityConfig;
}
