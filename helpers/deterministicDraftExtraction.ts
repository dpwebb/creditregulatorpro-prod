import {
  enrichExtractionWithSystemFields,
  validatePassAExtraction,
} from "./openaiPassAValidator";
import {
  ExtractedValue,
  PassADraftExtraction,
  ProvenanceEvidence,
  RawEvidenceItem,
} from "./passAExtractorTypes";
import {
  AccountExtraction,
  FullDraftExtraction,
  InquiryExtraction,
  PublicRecordExtraction,
} from "./fullExtractionTypes";
import type { ComprehensiveParseResult } from "./reportParserTypes";

export interface DeterministicDraftExtractionResult {
  passA: PassADraftExtraction;
  fullExtraction: FullDraftExtraction;
}

function evidenceSnippet(value: unknown, fallback?: string | null): string {
  const source = String(fallback || value || "").replace(/\s+/g, " ").trim();
  return source ? source.split(/\s+/).slice(0, 25).join(" ") : "Value mapped from deterministic parser output";
}

function evidence(value: unknown, fallback?: string | null): ProvenanceEvidence {
  return {
    page_number: 1,
    source_method: "pdf_text",
    snippet: evidenceSnippet(value, fallback),
  };
}

function createValue<T>(
  value: T | null | undefined,
  fallbackSnippet?: string | null,
): ExtractedValue<T> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return {
    value,
    confidence: 1,
    evidence: evidence(value, fallbackSnippet),
  };
}

function requiredValue<T>(
  value: T,
  fallbackSnippet?: string | null,
  confidence = 1,
): ExtractedValue<T> {
  return {
    value,
    confidence,
    evidence: evidence(value, fallbackSnippet),
  };
}

function formatDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

function isMeaningfulName(value: string | null | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== "unknown" && normalized !== "unknown creditor" && normalized !== "n/a";
}

function resolveCreditorName(
  tradeline: ComprehensiveParseResult["tradelines"][number],
): string | undefined {
  const candidates = [
    tradeline.creditorName,
    tradeline.collectionAgencyName,
    tradeline.originalCreditorName,
  ];
  return candidates.find(isMeaningfulName)?.trim();
}

function addRawEvidence(
  rawEvidence: RawEvidenceItem[],
  path: string,
  value: unknown,
  fallbackSnippet?: string | null,
) {
  if (value === undefined || value === null || value === "") return;
  rawEvidence.push({
    path,
    value,
    confidence: 1,
    evidence: evidence(value, fallbackSnippet),
  });
}

function splitName(fullName: string | null | undefined): {
  given?: string;
  middle?: string;
  surname?: string;
} {
  if (!fullName?.trim()) return {};
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { given: parts[0] };
  return {
    given: parts[0],
    middle: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    surname: parts[parts.length - 1],
  };
}

export function deriveDeterministicDraftExtractions(
  parseResult: ComprehensiveParseResult,
  artifactId: number,
): DeterministicDraftExtractionResult {
  const rawEvidence: RawEvidenceItem[] = [];
  const sourceBureauName =
    parseResult.sourceBureau?.bureauName ||
    parseResult.reportMetadata?.bureauName ||
    null;
  const reportDateIso = formatDate(parseResult.reportMetadata?.reportDate);
  const transUnionCaseId = parseResult.reportMetadata?.transUnionCaseId ?? null;

  const bureau_context: PassADraftExtraction["bureau_context"] = {};
  if (sourceBureauName) {
    bureau_context.bureau_name = createValue(sourceBureauName, parseResult.reportMetadata?.rawHeaderText);
    addRawEvidence(rawEvidence, "bureau_context.bureau_name", sourceBureauName, parseResult.reportMetadata?.rawHeaderText);
  }
  if (reportDateIso) {
    bureau_context.report_generated_at = createValue(reportDateIso, parseResult.reportMetadata?.rawHeaderText);
    addRawEvidence(rawEvidence, "bureau_context.report_generated_at", reportDateIso, parseResult.reportMetadata?.rawHeaderText);
  }
  if (transUnionCaseId) {
    bureau_context.tu_case_id = createValue(transUnionCaseId, parseResult.reportMetadata?.rawHeaderText);
    addRawEvidence(rawEvidence, "bureau_context.tu_case_id", transUnionCaseId, parseResult.reportMetadata?.rawHeaderText);
  }

  const consumer_profile: PassADraftExtraction["consumer_profile"] = {
    address_history: [],
    phone_history: [],
    employment_history: [],
  };

  const consumerInfo = parseResult.consumerInfo;
  if (consumerInfo) {
    const nameParts = splitName(consumerInfo.fullName);
    if (nameParts.given || nameParts.middle || nameParts.surname) {
      consumer_profile.legal_name = {
        given_name: createValue(nameParts.given, consumerInfo.fullName),
        middle_name: createValue(nameParts.middle, consumerInfo.fullName),
        surname: createValue(nameParts.surname, consumerInfo.fullName),
      };
      addRawEvidence(rawEvidence, "consumer_profile.legal_name.given_name", nameParts.given, consumerInfo.fullName);
      addRawEvidence(rawEvidence, "consumer_profile.legal_name.middle_name", nameParts.middle, consumerInfo.fullName);
      addRawEvidence(rawEvidence, "consumer_profile.legal_name.surname", nameParts.surname, consumerInfo.fullName);
    }

    const dob = formatDate(consumerInfo.dateOfBirth) || consumerInfo.dateOfBirthRaw || undefined;
    if (dob) {
      consumer_profile.date_of_birth = createValue(dob, consumerInfo.dateOfBirthRaw);
      addRawEvidence(rawEvidence, "consumer_profile.date_of_birth", dob, consumerInfo.dateOfBirthRaw);
    }

    if (consumerInfo.addressLine1) {
      consumer_profile.address_history.push({
        address_line_1: createValue(consumerInfo.addressLine1),
        address_line_2: createValue(consumerInfo.addressLine2),
        city: createValue(consumerInfo.city),
        province: createValue(consumerInfo.province),
        postal_code: createValue(consumerInfo.postalCode),
        status: createValue("Current"),
      });
      addRawEvidence(rawEvidence, "consumer_profile.address_history[0].address_line_1", consumerInfo.addressLine1);
    }

    consumerInfo.previousAddresses?.forEach((address, index) => {
      if (!address.addressLine1) return;
      consumer_profile.address_history.push({
        address_line_1: createValue(address.addressLine1),
        city: createValue(address.city),
        province: createValue(address.province),
        postal_code: createValue(address.postalCode),
        status: createValue("Previous"),
      });
      addRawEvidence(
        rawEvidence,
        `consumer_profile.address_history[${index + 1}].address_line_1`,
        address.addressLine1,
      );
    });

    if (consumerInfo.phone) {
      consumer_profile.phone_history.push({ phone_number: requiredValue(consumerInfo.phone) });
      addRawEvidence(rawEvidence, "consumer_profile.phone_history[0].phone_number", consumerInfo.phone);
    }
    if (consumerInfo.phoneSecondary) {
      const index = consumer_profile.phone_history.length;
      consumer_profile.phone_history.push({ phone_number: requiredValue(consumerInfo.phoneSecondary) });
      addRawEvidence(rawEvidence, `consumer_profile.phone_history[${index}].phone_number`, consumerInfo.phoneSecondary);
    }
  }

  parseResult.employmentInfo.forEach((employment, index) => {
    if (!employment.employerName) return;
    consumer_profile.employment_history.push({
      employer_name: createValue(employment.employerName),
      occupation: createValue(employment.occupation),
      employer_address: createValue(employment.employerAddress),
      hire_date: createValue(formatDate(employment.hireDate)),
      verification_date: createValue(formatDate(employment.verifiedDate)),
      status: createValue(
        employment.isCurrent === true
          ? "Current"
          : employment.isCurrent === false
            ? "Previous"
            : employment.employmentStatus?.toLowerCase().includes("previous")
              ? "Previous"
              : employment.employmentStatus?.toLowerCase().includes("current")
                ? "Current"
                : undefined,
      ),
    });
    addRawEvidence(rawEvidence, `consumer_profile.employment_history[${index}].employer_name`, employment.employerName);
  });

  const basePassProps = {
    channel_guess: sourceBureauName,
    bureau_context,
    consumer_profile,
    raw_evidence: rawEvidence,
    conflicts: [],
    missing_required_fields: [],
    quality_notes: [],
    extracted_at: new Date().toISOString(),
    doc_id: artifactId,
  };

  let passA = {
    ...basePassProps,
    schema: "urn:compnd:schemas:pass-a-draft-extraction:v1",
    pass: "A",
  } as PassADraftExtraction;

  passA = enrichExtractionWithSystemFields(passA, artifactId);
  const validationResult = validatePassAExtraction(passA);
  if (!validationResult.isValid) {
    console.warn(
      "[DeterministicDraftExtraction] Pass A validation failed, proceeding with best effort:",
      validationResult.error,
    );
  }

  const accounts: AccountExtraction[] = parseResult.tradelines.map((tradeline) => {
    const sourceText = tradeline.sourceText || undefined;
    const creditorName = resolveCreditorName(tradeline);
    return {
      creditor_name: creditorName
        ? requiredValue(creditorName, sourceText)
        : requiredValue("Unknown Creditor", sourceText, 0),
      account_number_partial: createValue(tradeline.accountNumber, sourceText),
      account_type: createValue(tradeline.accountType, sourceText),
      responsibility: createValue(tradeline.responsibilityCode, sourceText),
      date_opened: createValue(formatDate(tradeline.dates?.opened), sourceText),
      date_closed: createValue(formatDate(tradeline.dates?.closed), sourceText),
      date_reported: createValue(formatDate(tradeline.dates?.reported), sourceText),
      date_last_activity: createValue(formatDate(tradeline.lastActivityDate), sourceText),
      date_last_payment: createValue(formatDate(tradeline.lastPaymentDate), sourceText),
      date_first_delinquency: createValue(formatDate(tradeline.dates?.dofd), sourceText),
      high_credit: createValue(tradeline.amounts?.high, sourceText),
      credit_limit: createValue(tradeline.creditLimit, sourceText),
      balance: createValue(tradeline.balance, sourceText),
      amount_past_due: createValue(tradeline.amounts?.pastDue, sourceText),
      monthly_payment: createValue(tradeline.monthlyPayment, sourceText),
      actual_payment: createValue(tradeline.lastPaymentAmount, sourceText),
      status: createValue(tradeline.status, sourceText),
      narrative_codes: tradeline.remarkCodes?.length
        ? tradeline.remarkCodes.map((code) => requiredValue(code, sourceText))
        : undefined,
      terms: createValue(tradeline.terms, sourceText),
      payment_history_profile: createValue(tradeline.paymentHistoryProfile || tradeline.paymentPattern, sourceText),
      months_reviewed: createValue(tradeline.monthsReviewed, sourceText),
      times_30_days_late: createValue(tradeline.paymentHistory?.["30"], sourceText),
      times_60_days_late: createValue(tradeline.paymentHistory?.["60"], sourceText),
      times_90_days_late: createValue(tradeline.paymentHistory?.["90"], sourceText),
    };
  });

  const inquiriesCreditRelated: InquiryExtraction[] = [];
  const inquiriesOther: InquiryExtraction[] = [];
  parseResult.inquiries.forEach((inquiry) => {
    const inquiryObject: InquiryExtraction = {
      inquirer_name: inquiry.creditorName
        ? requiredValue(inquiry.creditorName)
        : requiredValue("Unknown", null, 0),
      inquiry_date: requiredValue(formatDate(inquiry.inquiryDate) || "", null, inquiry.inquiryDate ? 1 : 0),
      inquiry_type: createValue(inquiry.inquiryType),
      phone_number: createValue(inquiry.phone ?? undefined),
    };
    if (inquiry.inquiryType === "hard") inquiriesCreditRelated.push(inquiryObject);
    else inquiriesOther.push(inquiryObject);
  });

  const publicRecords: PublicRecordExtraction[] = parseResult.publicRecords.map((record) => ({
    record_type: record.recordType
      ? requiredValue(record.recordType, record.rawSectionText)
      : requiredValue("other", record.rawSectionText, 0),
    filing_date: createValue(formatDate(record.filingDate), record.rawSectionText),
    court_name: createValue(record.courtName, record.rawSectionText),
    case_number: createValue(record.caseNumber, record.rawSectionText),
    status: createValue(record.status, record.rawSectionText),
    amount: createValue(record.amount, record.rawSectionText),
    trustee: createValue(record.trustee, record.rawSectionText),
    liability_amount: createValue(record.liabilityAmount, record.rawSectionText),
    asset_amount: createValue(record.assetAmount, record.rawSectionText),
  }));

  const fullExtraction = {
    ...basePassProps,
    schema: "urn:compnd:schemas:tu-full-draft-extraction:v1",
    pass: "A_FULL",
    portal_summary: {},
    accounts,
    inquiries_credit_related: inquiriesCreditRelated,
    inquiries_other: inquiriesOther,
    insolvency_public_records: {
      section_present: publicRecords.length > 0,
      records: publicRecords,
    },
  } as FullDraftExtraction;

  return {
    passA,
    fullExtraction,
  };
}
