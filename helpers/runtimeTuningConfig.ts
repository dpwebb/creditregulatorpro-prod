import { logger } from "./logger";

export type RuntimeEnv = Record<string, string | undefined>;
export type ConfigWarning = (message: string, meta?: Record<string, unknown>) => void;

export type DbPoolConfig = {
  max: number;
  idleTimeoutSeconds: number;
};

export type SessionTouchConfig = {
  touchIntervalSeconds: number;
};

export const DEFAULT_DB_POOL_MAX = 3;
export const DEFAULT_DB_IDLE_TIMEOUT_SECONDS = 10;
export const DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS = 300;

const DB_POOL_MAX_LIMITS = { min: 1, max: 100 } as const;
const DB_IDLE_TIMEOUT_LIMITS = { min: 1, max: 3600 } as const;
const SESSION_TOUCH_INTERVAL_LIMITS = { min: 1, max: 86400 } as const;

function parseBoundedInteger(
  env: RuntimeEnv,
  name: string,
  defaultValue: number,
  limits: { min: number; max: number },
  warn: ConfigWarning,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= limits.min && parsed <= limits.max) {
    return parsed;
  }

  warn("Invalid numeric runtime configuration; using safe default.", {
    name,
    value: raw,
    defaultValue,
    min: limits.min,
    max: limits.max,
  });
  return defaultValue;
}

export function resolveDbPoolConfig(
  env: RuntimeEnv = process.env,
  warn: ConfigWarning = logger.warn,
): DbPoolConfig {
  return {
    max: parseBoundedInteger(env, "CRP_DB_POOL_MAX", DEFAULT_DB_POOL_MAX, DB_POOL_MAX_LIMITS, warn),
    idleTimeoutSeconds: parseBoundedInteger(
      env,
      "CRP_DB_IDLE_TIMEOUT_SECONDS",
      DEFAULT_DB_IDLE_TIMEOUT_SECONDS,
      DB_IDLE_TIMEOUT_LIMITS,
      warn,
    ),
  };
}

export function resolveSessionTouchConfig(
  env: RuntimeEnv = process.env,
  warn: ConfigWarning = logger.warn,
): SessionTouchConfig {
  return {
    touchIntervalSeconds: parseBoundedInteger(
      env,
      "CRP_SESSION_TOUCH_INTERVAL_SECONDS",
      DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS,
      SESSION_TOUCH_INTERVAL_LIMITS,
      warn,
    ),
  };
}

export function shouldTouchSessionLastAccessed(
  lastAccessed: Date,
  now: Date = new Date(),
  touchIntervalSeconds = resolveSessionTouchConfig().touchIntervalSeconds,
): boolean {
  const lastAccessedMs = lastAccessed.getTime();
  if (!Number.isFinite(lastAccessedMs)) return true;
  return now.getTime() - lastAccessedMs >= touchIntervalSeconds * 1000;
}
