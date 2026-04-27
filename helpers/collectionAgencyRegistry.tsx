import type { CanadianProvince } from "./schema";

export interface ProvinceLicensingInfo {
  province: CanadianProvince;
  regulatoryBody: string;
  registryName: string;
  websiteUrl: string;
  licenseRequired: boolean;
  penaltyForUnlicensed: string;
  relevantStatute: string;
}

export interface AgencyValidationResult {
  isLikelyLicensed: boolean;
  confidence: number;
  flags: string[];
  licensingRequirements: ProvinceLicensingInfo | null;
}

const REGISTRY_DB: Record<CanadianProvince, ProvinceLicensingInfo> = {
  ON: {
    province: "ON",
    regulatoryBody: "Ministry of Public and Business Service Delivery",
    registryName: "Consumer Beware List / Collection Agency Search",
    websiteUrl: "https://www.ontario.ca/page/search-collection-agency",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines up to $250,000 for corporations",
    relevantStatute: "Collection and Debt Settlement Services Act, R.S.O. 1990",
  },
  BC: {
    province: "BC",
    regulatoryBody: "Consumer Protection BC",
    registryName: "Licensee Search",
    websiteUrl: "https://www.consumerprotectionbc.ca/licensee-search/",
    licenseRequired: true,
    penaltyForUnlicensed: "Administrative penalties and cease/desist orders",
    relevantStatute: "Business Practices and Consumer Protection Act",
  },
  AB: {
    province: "AB",
    regulatoryBody: "Service Alberta",
    registryName: "Find a licensed business",
    websiteUrl: "https://www.alberta.ca/lookup-business-license.aspx",
    licenseRequired: true,
    penaltyForUnlicensed: "Up to $300,000 fine or imprisonment",
    relevantStatute: "Consumer Protection Act",
  },
  QC: {
    province: "QC",
    regulatoryBody: "Office de la protection du consommateur (OPC)",
    registryName: "Get information about a merchant",
    websiteUrl: "https://www.opc.gouv.qc.ca/en/information-merchant/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines and injunctions",
    relevantStatute: "Collection of Certain Debts Act",
  },
  SK: {
    province: "SK",
    regulatoryBody: "Financial and Consumer Affairs Authority (FCAA)",
    registryName: "Licensed Collection Agents",
    websiteUrl: "https://fcaa.gov.sk.ca/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines and sanctions",
    relevantStatute: "The Collection Agents Act",
  },
  MB: {
    province: "MB",
    regulatoryBody: "Consumer Protection Office",
    registryName: "Licensed Collection Agencies",
    websiteUrl: "https://www.gov.mb.ca/cp/cpo/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines up to $300,000",
    relevantStatute: "The Consumer Protection Act",
  },
  NS: {
    province: "NS",
    regulatoryBody: "Service Nova Scotia",
    registryName: "Licensing Search",
    websiteUrl: "https://novascotia.ca/sns/access/business/licensed-businesses.asp",
    licenseRequired: true,
    penaltyForUnlicensed: "Summary conviction fines",
    relevantStatute: "Collection Agencies Act",
  },
  NB: {
    province: "NB",
    regulatoryBody: "Financial and Consumer Services Commission (FCNB)",
    registryName: "Portal Search",
    websiteUrl: "https://portal.fcnb.ca/",
    licenseRequired: true,
    penaltyForUnlicensed: "Administrative penalties",
    relevantStatute: "Collection Agencies Act",
  },
  NL: {
    province: "NL",
    regulatoryBody: "Digital Government and Service NL",
    registryName: "Licensee Registry",
    websiteUrl: "https://www.gov.nl.ca/dgsnl/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines and orders",
    relevantStatute: "Collections Act",
  },
  PE: {
    province: "PE",
    regulatoryBody: "Department of Justice and Public Safety",
    registryName: "Licensed Agencies",
    websiteUrl: "https://www.princeedwardisland.ca/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines",
    relevantStatute: "Collection Agencies Act",
  },
  NT: {
    province: "NT",
    regulatoryBody: "Consumer Affairs",
    registryName: "Business Licensing",
    websiteUrl: "https://www.maca.gov.nt.ca/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines",
    relevantStatute: "Consumer Protection Act",
  },
  NU: {
    province: "NU",
    regulatoryBody: "Consumer Affairs",
    registryName: "Business Registry",
    websiteUrl: "https://www.gov.nu.ca/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines",
    relevantStatute: "Consumer Protection Act",
  },
  YT: {
    province: "YT",
    regulatoryBody: "Professional Licensing & Regulatory Affairs",
    registryName: "Corporate Registry",
    websiteUrl: "https://yukon.ca/",
    licenseRequired: true,
    penaltyForUnlicensed: "Fines",
    relevantStatute: "Consumers Protection Act",
  },
};

/**
 * Normalizes an agency name for consistent matching by converting to uppercase,
 * trimming, removing extra spaces, and removing common punctuation.
 */
export function normalizeAgencyName(name: string): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .replace(/[.,\-'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getProvinceLicensingInfo(province: CanadianProvince): ProvinceLicensingInfo | null {
  return REGISTRY_DB[province] || null;
}

export function getRegistryLookupUrl(province: CanadianProvince): string | null {
  const info = getProvinceLicensingInfo(province);
  return info ? info.websiteUrl : null;
}

/**
 * Validates a collection agency name using heuristics to spot unlicensed or non-compliant debt collectors.
 * Canadian collection agencies are strictly regulated and typically must operate under their registered corporate name.
 */
export function validateCollectionAgencyName(agencyName: string, province: CanadianProvince): AgencyValidationResult {
  const flags: string[] = [];
  let isLikelyLicensed = true;
  let confidence = 100;

  if (!agencyName || agencyName.trim() === "" || agencyName.toLowerCase() === "unknown") {
    return {
      isLikelyLicensed: false,
      confidence: 100,
      flags: ["Agency name is missing or unknown. Anonymous collection reporting is a severe violation."],
      licensingRequirements: getProvinceLicensingInfo(province),
    };
  }

  const nameUpper = agencyName.toUpperCase();

  // Check for proper corporate suffixes (Most licensed agencies are incorporated)
  // Missing suffix alone only reduces confidence — it does not definitively mark as unlicensed
  const hasCorporateSuffix = /\b(INC|LTD|CORP|LLC|ULC|INCORPORATED|LIMITED|CORPORATION)\b/.test(nameUpper);
  if (!hasCorporateSuffix) {
    flags.push("Missing corporate suffix (Inc, Ltd, Corp). Legitimate licensed collection agencies usually operate as registered corporations.");
    confidence -= 30;
  }

  // Check for generic, non-specific names that obscure identity
  const genericNames = ["COLLECTION DEPT", "RECOVERY DEPT", "CREDIT SERVICES", "ACCOUNTS RECEIVABLE"];
  for (const generic of genericNames) {
    if (nameUpper.includes(generic) && nameUpper.length < generic.length + 8) {
      flags.push(`Uses generic or internal-sounding name ("${generic}"). Collections must be reported under the exact registered agency name.`);
      isLikelyLicensed = false;
      confidence = 90;
      break;
    }
  }

  // Suspicious formatting (e.g., masking in the name)
  if (/[*X]{3,}/.test(nameUpper)) {
    flags.push("Name contains masking characters. The identity of a debt collector cannot be hidden from the consumer.");
    isLikelyLicensed = false;
    confidence = 95;
  }

  // Only mark as not licensed if there are flags beyond just the missing corporate suffix
  const nonSuffixFlags = flags.filter(
    (f) => !f.startsWith("Missing corporate suffix")
  );
  if (nonSuffixFlags.length > 0) {
    isLikelyLicensed = false;
  }

  return {
    isLikelyLicensed,
    confidence: Math.max(0, confidence),
    flags,
    licensingRequirements: getProvinceLicensingInfo(province),
  };
}