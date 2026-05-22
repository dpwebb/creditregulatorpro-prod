const REDACTION = "[REDACTED]";

export const SENSITIVE_VALUE_PATTERNS = [
  { code: "private-key", pattern: /-----BEGIN [\s\S]*?PRIVATE KEY[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/i },
  { code: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/ },
  { code: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { code: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i },
  { code: "database-url", pattern: /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s"'<>]+/i },
  { code: "credential-url", pattern: /https?:\/\/[^/\s"'<>]+:[^@\s"'<>]+@[^\s"'<>]+/i },
  { code: "signed-url", pattern: /https?:\/\/[^\s"'<>]+[?&](?:X-Amz-Signature|X-Amz-Credential|Signature|sig|token|expires)=/i },
  { code: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { code: "ssn-or-sin", pattern: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/ },
  { code: "phone", pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { code: "account-number", pattern: /\b\d{12,19}\b/ },
  { code: "pdf-bytes", pattern: /\bJVBERi0[A-Za-z0-9+/=]{20,}/ },
  { code: "data-url-bytes", pattern: /\bdata:(?:application\/pdf|text\/plain|image\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=]{20,}/i },
  { code: "raw-credit-report-marker", pattern: /\b(?:TRANSUNION|EQUIFAX|EXPERIAN)\s+(?:CREDIT\s+REPORT|CONSUMER\s+DISCLOSURE)\b/i },
];

export function findSensitiveEvidenceValues(value, {
  path = "$",
  findings = [],
} = {}) {
  if (typeof value === "string") {
    for (const { code, pattern } of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        findings.push({ path, code });
      }
    }
    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidenceValues(item, { path: `${path}[${index}]`, findings }));
    return findings;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findSensitiveEvidenceValues(item, { path: `${path}.${key}`, findings });
    }
  }

  return findings;
}

export function sanitizeProductionEvidenceValue(value) {
  if (typeof value === "string") {
    let sanitized = value;
    for (const { pattern } of SENSITIVE_VALUE_PATTERNS) {
      sanitized = sanitized.replace(pattern, REDACTION);
    }
    return sanitized;
  }

  if (Array.isArray(value)) return value.map((item) => sanitizeProductionEvidenceValue(item));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeProductionEvidenceValue(item)]),
    );
  }

  return value;
}

