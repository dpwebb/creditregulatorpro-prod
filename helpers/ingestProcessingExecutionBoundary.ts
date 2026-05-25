export type IngestProcessingRuntimeKind = "local" | "test" | "staging" | "production" | "unknown";

export type IngestProcessingInlineGate = {
  allowed: boolean;
  runtimeKind: IngestProcessingRuntimeKind;
  explicitFlag: boolean;
  reason: string;
};

const INLINE_FLAG = "CRP_ALLOW_REQUEST_BOUND_INGEST_PROCESSING";
const DISABLE_FLAG = "CRP_DISABLE_REQUEST_BOUND_INGEST_PROCESSING";
const ENVIRONMENT_KEYS = [
  "CRP_ENV",
  "APP_ENV",
  "FLOOT_ENV",
  "DEPLOYMENT_ENV",
  "ENVIRONMENT",
  "VERCEL_ENV",
] as const;

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveIngestProcessingRuntimeKind(
  env: NodeJS.ProcessEnv = process.env,
): IngestProcessingRuntimeKind {
  for (const key of ENVIRONMENT_KEYS) {
    const value = normalized(env[key]);
    if (!value) continue;
    if (value === "production" || value === "prod" || value.includes("production")) return "production";
    if (value === "staging" || value.includes("staging")) return "staging";
    if (value === "test" || value === "ci") return "test";
    if (value === "local" || value === "development" || value === "dev") return "local";
  }

  const nodeEnv = normalized(env.NODE_ENV);
  if (normalized(env.CRP_LOCAL_DEV) === "true" && nodeEnv !== "production") return "local";
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "development") return "local";
  if (nodeEnv === "production") return "production";

  return "unknown";
}

export function shouldAllowRequestBoundIngestProcessing(
  env: NodeJS.ProcessEnv = process.env,
): IngestProcessingInlineGate {
  const runtimeKind = resolveIngestProcessingRuntimeKind(env);
  const explicitFlag = normalized(env[INLINE_FLAG]) === "true";
  const disabledFlag = normalized(env[DISABLE_FLAG]) === "true";

  if (disabledFlag) {
    return {
      allowed: false,
      runtimeKind,
      explicitFlag,
      reason: `${DISABLE_FLAG}=true disables request-bound ingest processing.`,
    };
  }

  if (runtimeKind === "local") {
    return {
      allowed: true,
      runtimeKind,
      explicitFlag,
      reason: "Local developer runtime allows request-bound ingest processing when no worker is running.",
    };
  }

  if (!explicitFlag) {
    return {
      allowed: false,
      runtimeKind,
      explicitFlag,
      reason: `${INLINE_FLAG}=true is required for request-bound ingest processing.`,
    };
  }

  if (runtimeKind === "test") {
    return {
      allowed: true,
      runtimeKind,
      explicitFlag,
      reason: "Explicit test request-bound ingest processing flag is enabled.",
    };
  }

  return {
    allowed: false,
    runtimeKind,
    explicitFlag,
    reason: "Request-bound ingest processing is refused outside local/test runtime.",
  };
}
