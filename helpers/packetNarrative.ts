import {
  formatPacketAccountIdentifier,
  formatPacketConsumerEvidenceReference,
  formatPacketDisplayDateOrNull,
  formatPacketDisplayValue,
  formatPacketFieldLabel,
  hasReliablePacketAccountIdentifier,
  redactPacketSensitiveText,
} from "./disputePacketHumanization";
import type {
  DisputePacketType,
  PacketNarrative,
  PacketNarrativeCautionLevel,
  PacketNarrativeDisputeCategory,
} from "./disputePacketTemplate";

const MATERIAL_OLD_DATE_YEARS = 6;

const ADVERSE_STATUS_PATTERN =
  /\b(collection|default|charge\s*-?\s*off|charged\s*-?\s*off|write\s*-?\s*off|written\s*-?\s*off|bad debt|derogatory|delinquent|past due|late|repossession|foreclosure)\b/i;

export interface BuildPacketNarrativeInput {
  packetType: DisputePacketType;
  issueId?: number | null;
  tradelineId?: number | null;
  reportArtifactId?: number | null;
  reportType?: string | null;
  reportDate?: Date | string | null;
  bureauName?: string | null;
  consumerProvince?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  accountType?: string | null;
  accountStatus?: string | null;
  balance?: string | number | null;
  currentBalance?: string | number | null;
  openedDate?: Date | string | null;
  closedDate?: Date | string | null;
  dateOfFirstDelinquency?: Date | string | null;
  dateOfLastPayment?: Date | string | null;
  lastActivityDate?: Date | string | null;
  dateLastReported?: Date | string | null;
  amountPastDue?: string | number | null;
  isCollectionAccount?: boolean | null;
  collectionAgencyName?: string | null;
  originalCreditorName?: string | null;
  disputedField?: string | null;
  reportedValue?: string | number | Date | null;
  expectedValue?: string | number | Date | null;
  issueType?: string | null;
  evidenceReference?: string | null;
  evidencePageNumber?: number | null;
  evidenceSnippet?: string | null;
  ruleIds?: string[];
  regulationIds?: string[];
  evidenceIds?: string[];
  readinessWarnings?: string[];
  readinessBlockers?: string[];
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeNarrativeText(value: unknown, accountNumber?: string | null): string {
  return redactPacketSensitiveText(value, accountNumber)
    .replace(/\bsource\s+report\b/gi, "credit report")
    .replace(/\breport\s+artifact\b/gi, "credit report")
    .replace(/\bartifact\b/gi, "credit report")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function dedupeNarrativeText(values: Array<string | null | undefined>): string[] {
  const output: string[] = [];
  const keys: string[] = [];

  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = sentenceKey(text);
    const duplicate = keys.some((existing) =>
      existing === key ||
      (existing.length > 40 && key.includes(existing)) ||
      (key.length > 40 && existing.includes(key))
    );
    if (!duplicate) {
      output.push(text);
      keys.push(key);
    }
  }

  return output;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!hasText(String(value ?? ""))) return null;
  const raw = String(value).trim();
  if (/^(not known|not reported|not provided|not available|information not provided on report)$/i.test(raw)) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearsBetween(later: Date | null, earlier: Date | null): number | null {
  if (!later || !earlier) return null;
  return (later.getTime() - earlier.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function normalizedField(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDateLastReportedField(value: unknown): boolean {
  const normalized = normalizedField(value);
  return (
    normalized === "datelastreported" ||
    normalized === "lastreporteddate" ||
    normalized === "lasreporteddate" ||
    normalized.includes("lastreported")
  );
}

function isAccountNumberMissing(value: unknown): boolean {
  return !hasReliablePacketAccountIdentifier(value);
}

function amountGreaterThanZero(value: unknown): boolean {
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) && numeric > 0;
}

function hasKnownAdverseSignal(input: BuildPacketNarrativeInput): boolean {
  return Boolean(
    input.isCollectionAccount === true ||
      ADVERSE_STATUS_PATTERN.test(String(input.accountStatus ?? "")) ||
      ADVERSE_STATUS_PATTERN.test(String(input.issueType ?? "")) ||
      ADVERSE_STATUS_PATTERN.test(String(input.collectionAgencyName ?? "")) ||
      amountGreaterThanZero(input.amountPastDue) ||
      parseDate(input.dateOfFirstDelinquency),
  );
}

function materiallyOldReportedDate(input: BuildPacketNarrativeInput, displayField: string): boolean {
  if (!isDateLastReportedField(displayField)) return false;
  const reportDate = parseDate(input.reportDate);
  const reportedDate = parseDate(input.reportedValue) ?? parseDate(input.dateLastReported);
  const age = yearsBetween(reportDate, reportedDate);
  return age !== null && age >= MATERIAL_OLD_DATE_YEARS;
}

function inferDisputeCategory(input: BuildPacketNarrativeInput, displayField: string): PacketNarrativeDisputeCategory {
  const issueType = String(input.issueType ?? "").toUpperCase();
  const field = normalizedField(displayField);
  const oldReportedDate = materiallyOldReportedDate(input, displayField);

  if (oldReportedDate && !hasKnownAdverseSignal(input)) return "POSSIBLE_OBSOLETE_OR_STALE_REPORTING";
  if (isAccountNumberMissing(input.accountNumber) && (field.includes("account") || oldReportedDate)) {
    return oldReportedDate ? "POSSIBLE_OBSOLETE_OR_STALE_REPORTING" : "MISSING_ACCOUNT_IDENTIFIER";
  }
  if (issueType.includes("DUPLICATE") || issueType.includes("CONFLICT")) return "DUPLICATE_OR_CONFLICTING_ACCOUNT";
  if (issueType.includes("IDENTITY") || issueType.includes("ALIAS") || issueType.includes("MIXED_FILE")) {
    return "IDENTITY_OR_ALIAS_MISMATCH";
  }
  if (issueType.includes("ACCOUNT_NOT_RECOGNIZED")) return "ACCOUNT_NOT_RECOGNIZED";
  if (issueType.includes("COLLECTION") || issueType.includes("DEFAULT") || hasKnownAdverseSignal(input)) {
    return "COLLECTION_OR_DEFAULT_STATUS";
  }
  if (issueType.includes("BALANCE") || issueType.includes("PAYMENT") || field.includes("balance") || field.includes("status")) {
    return "BALANCE_OR_STATUS_ACCURACY";
  }
  if (issueType.includes("UNSUPPORTED") || issueType.includes("UNVERIFIABLE") || issueType.includes("DOCUMENTATION")) {
    return "UNSUPPORTED_REPORTING";
  }
  if (displayField && displayField !== "Account information") return "FIELD_ACCURACY";
  if (input.accountName) return "GENERAL_ACCURACY";
  return "UNKNOWN";
}

function cautionLevelFor(
  category: PacketNarrativeDisputeCategory,
  input: BuildPacketNarrativeInput,
): PacketNarrativeCautionLevel {
  if ((input.readinessBlockers ?? []).length > 0 || category === "UNKNOWN") return "NEEDS_REVIEW";
  if ((input.readinessWarnings ?? []).length > 0) return "CAUTIOUS";
  if (category === "POSSIBLE_OBSOLETE_OR_STALE_REPORTING" && !hasKnownAdverseSignal(input)) return "CAUTIOUS";
  if (isAccountNumberMissing(input.accountNumber)) return "CAUTIOUS";
  return "NORMAL";
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

function buildIssueSummary(
  input: BuildPacketNarrativeInput,
  category: PacketNarrativeDisputeCategory,
  accountName: string,
  displayField: string,
  reportedValue: string,
): string {
  if (category === "POSSIBLE_OBSOLETE_OR_STALE_REPORTING") {
    return safeNarrativeText(
      `The report shows ${accountName} with ${displayField}: ${reportedValue}. Because this date is materially older than the report date, I am asking the bureau to verify the accuracy, completeness, support, and basis for continuing to publish this item on the current report.`,
      input.accountNumber,
    );
  }

  if (category === "MISSING_ACCOUNT_IDENTIFIER") {
    return safeNarrativeText(
      `The report shows ${accountName}, but the account number is not shown on the report. I am asking the recipient to verify the account identifier and supporting records before continuing to report the item.`,
      input.accountNumber,
    );
  }

  return safeNarrativeText(
    `The report shows ${accountName} with ${displayField}: ${reportedValue}. I dispute whether this information is accurate, complete, and supported.`,
    input.accountNumber,
  );
}

function buildFactualBasis(
  input: BuildPacketNarrativeInput,
  accountName: string,
  displayField: string,
  reportedValue: string,
): string[] {
  const reportDate = formatPacketDisplayDateOrNull(input.reportDate);
  const basis: string[] = [
    reportDate
      ? `The report dated ${reportDate} shows ${accountName}.`
      : `The credit report shows ${accountName}.`,
    `The report shows ${displayField}: ${reportedValue}.`,
  ];

  if (isAccountNumberMissing(input.accountNumber)) {
    basis.push("Account number not shown on report; see attached report page.");
  } else {
    basis.push(`The report shows ${formatPacketAccountIdentifier(input.accountNumber)}.`);
  }

  if (hasText(input.accountStatus)) basis.push(`The report shows account status: ${safeNarrativeText(input.accountStatus, input.accountNumber)}.`);
  if (hasText(input.accountType)) basis.push(`The report shows account type: ${safeNarrativeText(input.accountType, input.accountNumber)}.`);
  if (hasText(String(input.balance ?? input.currentBalance ?? ""))) {
    basis.push(`The report shows balance: ${formatPacketDisplayValue("balance", input.balance ?? input.currentBalance, input.accountNumber)}.`);
  }
  const openedDate = formatPacketDisplayDateOrNull(input.openedDate);
  if (openedDate) basis.push(`The report shows opened date: ${openedDate}.`);
  const closedDate = formatPacketDisplayDateOrNull(input.closedDate);
  if (closedDate) basis.push(`The report shows closed date: ${closedDate}.`);

  return dedupeNarrativeText(basis.map((value) => safeNarrativeText(value, input.accountNumber)));
}

function buildVerificationRequests(
  input: BuildPacketNarrativeInput,
  category: PacketNarrativeDisputeCategory,
  displayField: string,
): string[] {
  const requests = [
    input.packetType === "collection_agency"
      ? "Verify the source records supporting the collection account and the authority to collect or report it."
      : "Verify the source records supporting the account.",
    isAccountNumberMissing(input.accountNumber)
      ? "Verify the account identifier or explain why no account number is shown on the report."
      : "Verify the account identifier.",
    "Verify the account status.",
    `Verify the ${lowerFirst(displayField)}.`,
  ];

  if (category === "POSSIBLE_OBSOLETE_OR_STALE_REPORTING") {
    requests.push(
      "Verify the date of first delinquency/default if applicable.",
      "Verify whether the item is adverse, collection-related, defaulted, or otherwise damaging, if applicable.",
      "Verify the basis for continuing to publish this item on the current report.",
    );
  }

  if (category === "BALANCE_OR_STATUS_ACCURACY") {
    requests.push("Verify the balance, payment, and status records supporting the reported information.");
  }

  return dedupeNarrativeText(requests.map((value) => safeNarrativeText(value, input.accountNumber)));
}

function buildRequestedRemedies(category: PacketNarrativeDisputeCategory): string[] {
  const remedies = [
    "Correct any inaccurate or incomplete information.",
    "Remove the item if it cannot be verified.",
  ];

  if (category === "POSSIBLE_OBSOLETE_OR_STALE_REPORTING") {
    remedies.push("Remove or suppress the item if it is not reportable.");
  }

  remedies.push("Provide the investigation result in writing.");
  return dedupeNarrativeText(remedies);
}

function buildEvidenceReferences(
  input: BuildPacketNarrativeInput,
  accountName: string,
  displayField: string,
  reportedValue: string,
): string[] {
  const reportDate = formatPacketDisplayDateOrNull(input.reportDate);
  const reportLabel = safeNarrativeText(input.reportType || input.bureauName || "credit report", input.accountNumber);
  const base = reportDate
    ? `See attached ${reportLabel} dated ${reportDate}, ${accountName} entry, showing ${displayField}: ${reportedValue}.`
    : `See attached ${reportLabel}, ${accountName} entry, showing ${displayField}: ${reportedValue}.`;
  const formattedEvidence = formatPacketConsumerEvidenceReference({
    evidenceReference: input.evidenceReference,
    fieldName: displayField,
    pageNumber: input.evidencePageNumber,
    excerpt: input.evidenceSnippet,
    accountNumber: input.accountNumber,
    hasSourceReport: Boolean(input.reportArtifactId),
  });

  return dedupeNarrativeText([
    safeNarrativeText(base, input.accountNumber),
    formattedEvidence && formattedEvidence !== "Needs manual review"
      ? safeNarrativeText(formattedEvidence, input.accountNumber)
      : null,
  ]);
}

function buildInternalReference(input: BuildPacketNarrativeInput): string | null {
  const values = [
    input.issueId ? `finding:${input.issueId}` : null,
    input.tradelineId ? `tradeline:${input.tradelineId}` : null,
    input.reportArtifactId ? `reportArtifact:${input.reportArtifactId}` : null,
    input.ruleIds?.length ? `rules:${input.ruleIds.join(",")}` : null,
    input.regulationIds?.length ? `regulations:${input.regulationIds.join(",")}` : null,
    input.evidenceIds?.length ? `evidence:${input.evidenceIds.join(",")}` : null,
  ].filter((value): value is string => Boolean(value));

  return values.length > 0 ? values.join("|") : null;
}

export function buildPacketNarrative(input: BuildPacketNarrativeInput): PacketNarrative {
  const displayField = formatPacketFieldLabel(input.disputedField ?? "Account information");
  const accountName = safeNarrativeText(input.accountName || "Company listed on report", input.accountNumber);
  const reportedValue = formatPacketDisplayValue(displayField, input.reportedValue, input.accountNumber);
  const category = inferDisputeCategory(input, displayField);
  const readinessWarnings = dedupeNarrativeText([
    ...(input.readinessWarnings ?? []),
    isAccountNumberMissing(input.accountNumber)
      ? "Account number is not shown on the report; verification should use the attached report entry."
      : null,
    !hasText(input.evidenceReference) || input.evidenceReference === "Needs manual review"
      ? "Evidence reference needs manual review before sending."
      : null,
  ].map((value) => value ? safeNarrativeText(value, input.accountNumber) : null));
  const readinessBlockers = dedupeNarrativeText([
    ...(input.readinessBlockers ?? []),
    category === "UNKNOWN"
      ? "Packet narrative could not identify a specific dispute category from the available finding data."
      : null,
  ].map((value) => value ? safeNarrativeText(value, input.accountNumber) : null));

  return {
    disputeCategory: category,
    cautionLevel: cautionLevelFor(category, { ...input, readinessWarnings, readinessBlockers }),
    issueSummary: buildIssueSummary(input, category, accountName, displayField, reportedValue),
    factualBasis: buildFactualBasis(input, accountName, displayField, reportedValue),
    consumerAssertion: "I dispute the accuracy, completeness, support, and continued reportability of this item.",
    verificationRequests: buildVerificationRequests(input, category, displayField),
    requestedRemedies: buildRequestedRemedies(category),
    evidenceReferences: buildEvidenceReferences(input, accountName, displayField, reportedValue),
    readinessWarnings,
    readinessBlockers,
    internalReference: buildInternalReference(input),
    externalReferenceDisplay: input.issueId ? `Issue ${input.issueId}` : null,
  };
}
