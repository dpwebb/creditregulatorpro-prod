const SENSITIVE_KEY_PATTERN =
  /(password|passcode|token|secret|authorization|cookie|api[_-]?key|private[_-]?key|session|jwt|bearer|sin|ssn|card(number)?|cvv|cvc)/i;

const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[CIRCULAR]";
const TRUNCATED_VALUE = "[TRUNCATED]";
const MAX_DEPTH = 6;

function sanitizeValue(
  value: unknown,
  depth: number,
  visited: WeakSet<object>
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > MAX_DEPTH) {
    return TRUNCATED_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1, visited));
  }

  if (typeof value !== "object") {
    return value;
  }

  if (visited.has(value)) {
    return CIRCULAR_VALUE;
  }
  visited.add(value);

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED_VALUE;
      continue;
    }
    output[key] = sanitizeValue(nestedValue, depth + 1, visited);
  }

  return output;
}

export function sanitizeAuditLogDetails(details: unknown): unknown {
  return sanitizeValue(details, 0, new WeakSet<object>());
}

