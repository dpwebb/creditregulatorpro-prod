export const PLATFORM_RESET_CONFIRMATION_PHRASE: string;

export type PlatformResetDatabaseTarget = {
  source: string;
  host: string;
  port: string;
  database: string;
};

export type PlatformResetRuntimeContext = {
  database: PlatformResetDatabaseTarget;
  environment: {
    kind: string;
    reason: string;
  };
  storage: {
    provider: string;
    configuredPath: string;
    root: string;
  };
};

export function detectResetRuntimeContext(env?: NodeJS.ProcessEnv): PlatformResetRuntimeContext;

export function runReset(options: Record<string, unknown>, env?: NodeJS.ProcessEnv): Promise<Record<string, unknown>>;
