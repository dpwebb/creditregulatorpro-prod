import { ExtractedConsumerInfo } from "./consumerInfoExtractor";

export type AddressInfo = {
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
};

export type UserProfileInfo = {
  fullName: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  dateOfBirth: Date | null;
  phone: string | null;
};

export type ConsumerInfoComparison = {
  isMatch: boolean; // true if ALL comparison fields match (or are null)
  nameMismatch: boolean;
  addressMismatch: boolean;
  cityMismatch: boolean;
  provinceMismatch: boolean;
  postalCodeMismatch: boolean;
  dobMismatch: boolean;
  phoneMismatch: boolean;
  extractedInfo: ExtractedConsumerInfo;
  profileInfo: UserProfileInfo;
  details: {
    nameComparison: {
      extracted: string | null;
      profile: string | null;
      similarity: number;
    };
    addressComparison: {
      extracted: string | null;
      profile: string | null;
      similarity: number;
    };
    cityComparison: {
      extracted: string | null;
      profile: string | null;
      match: boolean;
    };
    provinceComparison: {
      extracted: string | null;
      profile: string | null;
      match: boolean;
    };
    postalCodeComparison: {
      extracted: string | null;
      profile: string | null;
      match: boolean;
    };
    dobComparison: {
      extracted: Date | null;
      profile: Date | null;
      match: boolean;
    };
    phoneComparison: {
      extracted: string | null;
      profile: string | null;
      match: boolean;
    };
  };
};

/**
 * Normalizes a string for comparison:
 * - Lowercase
 * - Remove accents
 * - Remove punctuation (except hyphens in names sometimes, but here we strip most)
 * - Collapse whitespace
 */
export function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, " ") // Replace punctuation with space
    .replace(/\s+/g, " ") // Collapse spaces
    .trim();
}

/**
 * Normalizes address strings by expanding common Canadian abbreviations.
 * Should be applied before similarity comparison.
 */
export function normalizeAddress(str: string): string {
  if (!str) return "";
  
  let normalized = str.toLowerCase().trim();
  
  // Expand common address abbreviations
  const abbreviations: Record<string, string> = {
    // Street types
    "\\bst\\b": "street",
    "\\bst\\.\\b": "street",
    "\\bave\\b": "avenue",
    "\\bave\\.\\b": "avenue",
    "\\brd\\b": "road",
    "\\brd\\.\\b": "road",
    "\\bdr\\b": "drive",
    "\\bdr\\.\\b": "drive",
    "\\bblvd\\b": "boulevard",
    "\\bblvd\\.\\b": "boulevard",
    "\\bcres\\b": "crescent",
    "\\bcres\\.\\b": "crescent",
    "\\bcrt\\b": "court",
    "\\bct\\b": "court",
    "\\bct\\.\\b": "court",
    "\\bpl\\b": "place",
    "\\bpl\\.\\b": "place",
    "\\bapt\\b": "apartment",
    "\\bapt\\.\\b": "apartment",
    // Lane, Terrace, etc.
    "\\bln\\b": "lane",
    "\\bln\\.\\b": "lane",
    "\\bter\\b": "terrace",
    "\\bter\\.\\b": "terrace",
    "\\bpkwy\\b": "parkway",
    "\\bpkwy\\.\\b": "parkway",
  };
  
  // Apply abbreviation expansions
  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(abbr, "gi");
    normalized = normalized.replace(regex, full);
  }
  
  // Normalize "# 123" or "#123" to "unit 123"
  normalized = normalized.replace(/#\s*(\d+)/g, "unit $1");
  
  // Final normalization pass
  normalized = normalizeString(normalized);
  
  return normalized;
}

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates similarity score (0-100) between two strings.
 * @param useAddressNormalization If true, applies address-specific normalization
 */
export function calculateSimilarity(
  str1: string,
  str2: string,
  useAddressNormalization: boolean = false
): number {
  const s1 = useAddressNormalization
    ? normalizeAddress(str1)
    : normalizeString(str1);
  const s2 = useAddressNormalization
    ? normalizeAddress(str2)
    : normalizeString(str2);

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return Math.max(0, Math.round((1 - distance / maxLength) * 100));
}

/**
 * Checks if two names are similar enough.
 * Default threshold: 85
 */
export function areNamesSimilar(
  name1: string | null,
  name2: string | null,
  threshold: number = 85
): boolean {
  if (!name1 && !name2) return true;
  if (!name1 || !name2) return false;

  return calculateSimilarity(name1, name2) >= threshold;
}

/**
 * Checks if two addresses are similar enough.
 * - Street: threshold 80 (with address normalization)
 * - City: threshold 90
 * - Province: Exact match (normalized)
 * - Postal Code: FSA (first 3 chars) match
 */
export function areAddressesSimilar(
  addr1: AddressInfo,
  addr2: AddressInfo,
  threshold: number = 80
): boolean {
  // If both are completely empty, consider it a match (nothing to compare)
  const isAddr1Empty = !addr1.addressLine1 && !addr1.postalCode;
  const isAddr2Empty = !addr2.addressLine1 && !addr2.postalCode;
  if (isAddr1Empty && isAddr2Empty) return true;

  // 1. Province Check (Strict) - only if both have values
  if (addr1.province && addr2.province) {
    if (normalizeString(addr1.province) !== normalizeString(addr2.province)) {
      return false;
    }
  }

  // 2. Postal Code Check (FSA - First 3 chars) - only if both have values
  if (addr1.postalCode && addr2.postalCode) {
    const fsa1 = normalizeString(addr1.postalCode).substring(0, 3);
    const fsa2 = normalizeString(addr2.postalCode).substring(0, 3);
    if (fsa1 !== fsa2) return false;
  }

  // 3. City Check (High similarity) - only if both have values
  if (addr1.city && addr2.city) {
    if (calculateSimilarity(addr1.city, addr2.city) < 90) {
      return false;
    }
  }

  // 4. Street Address Check (Moderate similarity with address normalization)
  if (addr1.addressLine1 && addr2.addressLine1) {
    if (
      calculateSimilarity(addr1.addressLine1, addr2.addressLine1, true) <
      threshold
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Compares extracted info with user profile to detect mismatches.
 */
export function compareConsumerInfo(
  extracted: ExtractedConsumerInfo,
  profile: UserProfileInfo
): ConsumerInfoComparison {
  const nameSimilarity =
    extracted.fullName && profile.fullName
      ? calculateSimilarity(extracted.fullName, profile.fullName)
      : 0;

  const addressSimilarity =
    extracted.addressLine1 && profile.addressLine1
      ? calculateSimilarity(extracted.addressLine1, profile.addressLine1, true)
      : 0;

  const nameMatch = areNamesSimilar(extracted.fullName, profile.fullName);
  
  const addressMatch = areAddressesSimilar(
    {
      addressLine1: extracted.addressLine1,
      city: extracted.city,
      province: extracted.province,
      postalCode: extracted.postalCode,
    },
    {
      addressLine1: profile.addressLine1,
      city: profile.city,
      province: profile.province,
      postalCode: profile.postalCode,
    }
  );

  // Detailed field matches
  const cityMatch =
    !extracted.city ||
    !profile.city ||
    calculateSimilarity(extracted.city, profile.city) >= 90;

  const provinceMatch =
    !extracted.province ||
    !profile.province ||
    normalizeString(extracted.province) === normalizeString(profile.province);

  const postalCodeMatch =
    !extracted.postalCode ||
    !profile.postalCode ||
    normalizeString(extracted.postalCode).substring(0, 3) ===
      normalizeString(profile.postalCode).substring(0, 3);

  let dobMatch = true;
  if (extracted.dateOfBirth && profile.dateOfBirth) {
    const d1 = new Date(extracted.dateOfBirth);
    const d2 = new Date(profile.dateOfBirth);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      dobMatch = d1.toISOString().split("T")[0] === d2.toISOString().split("T")[0];
    } else {
      dobMatch = false;
    }
  }

  const normalizePhone = (p: string) => p.replace(/\D/g, "");
  const phoneMatch =
    !extracted.phone ||
    !profile.phone ||
    normalizePhone(extracted.phone) === normalizePhone(profile.phone);

  return {
    isMatch: nameMatch && addressMatch && cityMatch && provinceMatch && postalCodeMatch && dobMatch && phoneMatch,
    nameMismatch: !nameMatch,
    addressMismatch: !addressMatch,
    cityMismatch: !cityMatch,
    provinceMismatch: !provinceMatch,
    postalCodeMismatch: !postalCodeMatch,
    dobMismatch: !dobMatch,
    phoneMismatch: !phoneMatch,
    extractedInfo: extracted,
    profileInfo: profile,
    details: {
      nameComparison: {
        extracted: extracted.fullName,
        profile: profile.fullName,
        similarity: nameSimilarity,
      },
      addressComparison: {
        extracted: extracted.addressLine1,
        profile: profile.addressLine1,
        similarity: addressSimilarity,
      },
      cityComparison: {
        extracted: extracted.city,
        profile: profile.city,
        match: cityMatch,
      },
      provinceComparison: {
        extracted: extracted.province,
        profile: profile.province,
        match: provinceMatch,
      },
      postalCodeComparison: {
        extracted: extracted.postalCode,
        profile: profile.postalCode,
        match: postalCodeMatch,
      },
      dobComparison: {
        extracted: extracted.dateOfBirth,
        profile: profile.dateOfBirth,
        match: dobMatch,
      },
      phoneComparison: {
        extracted: extracted.phone,
        profile: profile.phone,
        match: phoneMatch,
      },
    },
  };
}