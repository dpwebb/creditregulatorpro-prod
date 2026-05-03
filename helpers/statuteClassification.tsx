export type StatuteLifecycleStatus = "ACTIVE" | "AMENDED" | "REPEALED";

export type StatuteVersionLike = {
  statuteId: number;
  versionId: number;
  version: number;
  code: string;
  description: string | null;
  sectionReference: string | null;
  effectiveDate: Date | null;
  supersededDate: Date | null;
};

const TOPIC_RULES: Array<{ topic: string; patterns: RegExp[] }> = [
  {
    topic: "Credit Reporting",
    patterns: [/(\bCRA\b|consumer reporting|credit report)/i],
  },
  {
    topic: "Privacy",
    patterns: [/(\bPIPEDA\b|\bPIPA\b|privacy|personal information)/i],
  },
  {
    topic: "Consumer Protection",
    patterns: [/(\bCPA\b|\bCPBPA\b|consumer protection|business practices)/i],
  },
  {
    topic: "Debt Collection",
    patterns: [/(collection|collector|debt)/i],
  },
];

export function buildCitation(code: string, sectionReference: string | null): string {
  const normalizedCode = (code || "").trim().toUpperCase();
  const normalizedSection = (sectionReference || "").trim();
  if (!normalizedSection) {
    return normalizedCode;
  }
  return `${normalizedCode} ${normalizedSection}`.trim();
}

export function deriveTopic(code: string, description: string | null): string {
  const haystack = `${code || ""} ${description || ""}`;
  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return rule.topic;
    }
  }
  return "General";
}

export function normalizeForExactMatch(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getLifecycleStatus(
  row: StatuteVersionLike,
  versionsForSameStatute: StatuteVersionLike[]
): StatuteLifecycleStatus {
  if (!row.supersededDate) {
    return "ACTIVE";
  }

  const hasActiveVersion = versionsForSameStatute.some((v) => !v.supersededDate);
  const hasNewerVersion = versionsForSameStatute.some((v) => v.version > row.version);

  if (hasActiveVersion || hasNewerVersion) {
    return "AMENDED";
  }

  return "REPEALED";
}
