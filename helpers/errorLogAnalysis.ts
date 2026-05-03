import { createHash } from "crypto";
import { ErrorSeverity } from "./errorSeverity";

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /(bearer\s+)[a-z0-9\-._~+/]+=*/gi,
  /([?&](?:token|access_token|refresh_token|password|secret|api[_-]?key)=)[^&\s]+/gi,
  /\b(sk|pk)_[a-z0-9]{16,}\b/gi,
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d+\b/g, "#")
    .replace(/[a-f0-9]{8,}/gi, "*")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  let sanitized = message;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "$1[REDACTED]");
  }
  return sanitized;
}

export function classifyErrorSeverity(params: {
  actionType: string;
  entityType: string;
  errorMessage: string | null | undefined;
}): ErrorSeverity {
  const action = params.actionType.toLowerCase();
  const entity = params.entityType.toLowerCase();
  const message = (params.errorMessage || "").toLowerCase();
  const combined = `${action} ${entity} ${message}`;

  if (
    combined.includes("database") ||
    combined.includes("migration") ||
    combined.includes("constraint") ||
    combined.includes("out of memory") ||
    combined.includes("panic") ||
    combined.includes("fatal")
  ) {
    return "CRITICAL";
  }

  if (
    combined.includes("unauthorized") ||
    combined.includes("forbidden") ||
    combined.includes("permission") ||
    combined.includes("security") ||
    action.includes("login_failed")
  ) {
    return "HIGH";
  }

  if (
    combined.includes("timeout") ||
    combined.includes("validation") ||
    combined.includes("network") ||
    combined.includes("bad request") ||
    combined.includes("rate limit")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

export function buildErrorFingerprint(params: {
  actionType: string;
  entityType: string;
  errorMessage: string | null | undefined;
}): string {
  const normalized = [
    params.actionType,
    params.entityType,
    normalizeText(params.errorMessage || ""),
  ].join("|");

  return createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

export function extractRequestId(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const record = details as Record<string, unknown>;
  const value =
    record.requestId ??
    record.request_id ??
    record.traceId ??
    record.trace_id ??
    record.correlationId ??
    record.correlation_id;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function extractRouteContext(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const record = details as Record<string, unknown>;
  const value =
    record.route ??
    record.path ??
    record.endpoint ??
    record.url;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
