export type CreditorEntityType = "bank" | "credit_union" | "telecom" | "utility" | "collection" | "government" | "other";

export interface ResolvedEntity {
  normalizedName: string;
  canonicalName: string;
  knownAliases: string[];
  entityType: CreditorEntityType;
  parentCompany?: string;
}

export interface MatchResult {
  isMatch: boolean;
  confidence: number;
  matchReason: string;
}

// Built-in Canadian entity dictionary
const CANADIAN_ENTITIES: ResolvedEntity[] = [
  {
    normalizedName: "td bank",
    canonicalName: "TD Bank",
    knownAliases: ["td canada trust", "toronto dominion", "toronto-dominion bank", "td auto finance", "td financing"],
    entityType: "bank",
  },
  {
    normalizedName: "rbc",
    canonicalName: "Royal Bank of Canada",
    knownAliases: ["royal bank", "rbc royal bank", "rbc visa", "royal bank of canada"],
    entityType: "bank",
  },
  {
    normalizedName: "bmo",
    canonicalName: "Bank of Montreal",
    knownAliases: ["bmo mastercard", "bmo bank of montreal", "bmo auto", "bank of montreal"],
    entityType: "bank",
  },
  {
    normalizedName: "scotiabank",
    canonicalName: "Scotiabank",
    knownAliases: ["bank of nova scotia", "bns", "scotia", "scotia dealer advantage"],
    entityType: "bank",
  },
  {
    normalizedName: "cibc",
    canonicalName: "CIBC",
    knownAliases: ["canadian imperial bank of commerce", "cibc visa", "cibc mastercard", "cibc auto"],
    entityType: "bank",
  },
  {
    normalizedName: "national bank",
    canonicalName: "National Bank of Canada",
    knownAliases: ["nbc", "banque nationale", "national bank", "national bank of canada"],
    entityType: "bank",
  },
  {
    normalizedName: "desjardins",
    canonicalName: "Desjardins Group",
    knownAliases: ["caisse populaire", "desjardins visa", "desjardins card services", "desjardins"],
    entityType: "credit_union",
  },
  {
    normalizedName: "rogers",
    canonicalName: "Rogers Communications",
    knownAliases: ["rogers wireless", "rogers cable", "rogers bank", "rogers communications"],
    entityType: "telecom",
  },
  {
    normalizedName: "fido",
    canonicalName: "FIDO",
    knownAliases: ["fido solutions", "fido mobile"],
    entityType: "telecom",
    parentCompany: "Rogers Communications",
  },
  {
    normalizedName: "chatr",
    canonicalName: "Chatr Mobile",
    knownAliases: ["chatr wireless"],
    entityType: "telecom",
    parentCompany: "Rogers Communications",
  },
  {
    normalizedName: "bell",
    canonicalName: "Bell Canada",
    knownAliases: ["bell mobility", "bell aliant", "bell canada"],
    entityType: "telecom",
  },
  {
    normalizedName: "virgin plus",
    canonicalName: "Virgin Plus",
    knownAliases: ["virgin mobile", "virgin plus mobile"],
    entityType: "telecom",
    parentCompany: "Bell Canada",
  },
  {
    normalizedName: "telus",
    canonicalName: "Telus Communications",
    knownAliases: ["telus mobility"],
    entityType: "telecom",
  },
  {
    normalizedName: "koodo",
    canonicalName: "Koodo Mobile",
    knownAliases: ["koodo mobile", "koodo"],
    entityType: "telecom",
    parentCompany: "Telus Communications",
  },
  {
    normalizedName: "public mobile",
    canonicalName: "Public Mobile",
    knownAliases: ["public mobile"],
    entityType: "telecom",
    parentCompany: "Telus Communications",
  },
  {
    normalizedName: "canadian tire",
    canonicalName: "Canadian Tire Bank",
    knownAliases: ["ctfs", "canadian tire financial services", "ct bank", "canadian tire bank"],
    entityType: "bank",
  },
  {
    normalizedName: "capital one",
    canonicalName: "Capital One Canada",
    knownAliases: ["cap one", "capital one", "capital one bank"],
    entityType: "bank",
  },
  {
    normalizedName: "cbv",
    canonicalName: "CBV Collection Services",
    knownAliases: ["cbv", "cbv collections", "cbv collection services ltd"],
    entityType: "collection",
  },
  {
    normalizedName: "eos",
    canonicalName: "EOS Canada",
    knownAliases: ["eos canada inc", "eos ncca"],
    entityType: "collection",
  },
  {
    normalizedName: "ncri",
    canonicalName: "NCRI Inc",
    knownAliases: ["ncri inc", "ncri capital asset", "ncri capital asset inc"],
    entityType: "collection",
  },
  {
    normalizedName: "national legal group",
    canonicalName: "National Legal Group",
    knownAliases: ["national legal group"],
    entityType: "collection",
  },
];

const COLLECTION_ENTITY_KEYWORDS = [
  "collection",
  "collector",
  "recovery",
  "recoveries",
  "receivable",
  "receivables",
  "agency",
  "legal group",
  "bailiff",
  "debt",
  "capital asset",
  "asset recovery",
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Resolves a raw creditor name to a standardized entity definition.
 */
export function resolveCreditorEntity(name: string): ResolvedEntity {
  const normName = normalize(name);

  // Search exact or alias match in dictionary
  for (const entity of CANADIAN_ENTITIES) {
    if (
      entity.normalizedName === normName ||
      normName.includes(entity.normalizedName) ||
      entity.knownAliases.some(
        (alias) => normName.includes(alias) || (normName.length >= 4 && alias.includes(normName))
      )
    ) {
      return entity;
    }
  }

  // Fallback heuristic classification
  let fallbackType: CreditorEntityType = "other";
  if (normName.includes("bank") || normName.includes("banque")) fallbackType = "bank";
  else if (normName.includes("credit union") || normName.includes("caisse")) fallbackType = "credit_union";
  else if (COLLECTION_ENTITY_KEYWORDS.some((keyword) => normName.includes(keyword))) fallbackType = "collection";
  else if (normName.includes("hydro") || normName.includes("power") || normName.includes("energy")) fallbackType = "utility";
  else if (normName.includes("canada revenue") || normName.includes("cra") || normName.includes("gov")) fallbackType = "government";

  return {
    normalizedName: normName,
    canonicalName: name.trim(), // Use original as canonical if unknown
    knownAliases: [],
    entityType: fallbackType,
  };
}

/**
 * Returns the entity type classification for a given creditor name.
 */
export function getCreditorEntityType(name: string): CreditorEntityType {
  return resolveCreditorEntity(name).entityType;
}

export function isLikelyCollectionEntityName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return resolveCreditorEntity(name).entityType === "collection";
}

/**
 * Advanced matching logic to compare two creditor names to see if they represent the same entity.
 */
export function matchCreditorAcrossReports(name1: string, name2: string): MatchResult {
  if (!name1 || !name2) return { isMatch: false, confidence: 0, matchReason: "Missing name(s)" };

  const norm1 = normalize(name1);
  const norm2 = normalize(name2);

  if (norm1 === norm2) {
    return { isMatch: true, confidence: 100, matchReason: "Exact normalized string match" };
  }

  const entity1 = resolveCreditorEntity(name1);
  const entity2 = resolveCreditorEntity(name2);

  if (entity1.canonicalName === entity2.canonicalName && entity1.entityType !== "other") {
    return { isMatch: true, confidence: 95, matchReason: "Resolved to same canonical entity" };
  }

  // Simple containment check (e.g. "TD BANK" vs "TD BANK VISA")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shortest = Math.min(norm1.length, norm2.length);
    const longest = Math.max(norm1.length, norm2.length);
    if (shortest / longest > 0.6) {
      return { isMatch: true, confidence: 80, matchReason: "High substring overlap" };
    }
  }

  return { isMatch: false, confidence: 0, matchReason: "No match found" };
}
