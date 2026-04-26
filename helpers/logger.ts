type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[getConfiguredLevel()];
}

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const redactedKeys = new Set(["email", "token", "password", "authorization", "cookie"]);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    output[key] = redactedKeys.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return output;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const payload = sanitizeMeta(meta);
  const method =
    level === "debug" ? console.debug :
    level === "info" ? console.info :
    level === "warn" ? console.warn :
    console.error;
  if (payload) {
    method(message, payload);
    return;
  }
  method(message);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
