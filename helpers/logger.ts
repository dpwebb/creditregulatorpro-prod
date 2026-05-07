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
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    output[key] = sanitizeValue(key, value);
  }
  return output;
}

function sanitizeValue(key: string, value: unknown): unknown {
  const redactedKeys = new Set([
    "accountnumber",
    "address",
    "addressline1",
    "addressline2",
    "authorization",
    "cookie",
    "dateofbirth",
    "dob",
    "email",
    "firstname",
    "fullname",
    "lastname",
    "name",
    "password",
    "pdf",
    "phone",
    "postalcode",
    "postalorzip",
    "rawtext",
    "sin",
    "token",
  ]);
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (redactedKeys.has(normalizedKey)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(key, entry));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sanitizeValue(childKey, childValue);
    }
    return output;
  }
  return value;
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
