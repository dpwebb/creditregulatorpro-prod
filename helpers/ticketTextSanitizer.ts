const SENSITIVE_PATTERNS: RegExp[] = [
  /(bearer\s+)[a-z0-9\-._~+/]+=*/gi,
  /([?&](?:token|access_token|refresh_token|password|secret|api[_-]?key)=)[^&\s]+/gi,
  /\b(sk|pk)_[a-z0-9]{16,}\b/gi,
  /\b\d{12,19}\b/g,
];

export function sanitizeTicketPreview(text: string | null | undefined, maxLength = 160): string | null {
  if (!text) return null;
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '$1[REDACTED]');
  }
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (sanitized.length <= maxLength) {
    return sanitized;
  }
  return `${sanitized.slice(0, maxLength - 3)}...`;
}
