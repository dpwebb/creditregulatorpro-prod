import { LLMResponse } from "./docstrangeLLM";
import { ComprehensiveParseResult } from "./reportParserTypes";
import {
  PassADraftExtraction,
  RawEvidenceItem,
  ExtractedValue,
} from "./passAExtractorTypes";
import {
  FullDraftExtraction,
  AccountExtraction,
  InquiryExtraction,
  PublicRecordExtraction,
} from "./fullExtractionTypes";
import { mapDocStrangeResponseToResult } from "./docstrangeParser";
import {
  enrichExtractionWithSystemFields,
  validatePassAExtraction,
} from "./openaiPassAValidator";

export interface UnifiedExtractionResult {
  comprehensive: ComprehensiveParseResult;
  passA: PassADraftExtraction;
  fullExtraction: FullDraftExtraction;
}

/**
 * Creates an ExtractedValue stub for AI Vision extraction pipeline mapping.
 * Avoids generating undefined records if val is null or empty string.
 */
const evidenceSnippet = (val: unknown): string => {
  const text = String(val ?? "").replace(/\s+/g, " ").trim();
  return text ? text.split(/\s+/).slice(0, 25).join(" ") : "Value mapped from parser output";
};

const createEv = <T,>(
  val: T | null | undefined
): ExtractedValue<T> | undefined => {
  if (val === undefined || val === null || val === "") return undefined;
  return {
    value: val as T,
    confidence: 0.75,
    evidence: {
      page_number: 1,
      source_method: "ai_vision",
      snippet: evidenceSnippet(val),
    },
  };
};

const isMeaningfulName = (value: string | null | undefined): value is string => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== "unknown" && normalized !== "unknown creditor" && normalized !== "n/a";
};

const resolveCreditorNameForExtraction = (tradeline: ComprehensiveParseResult["tradelines"][number]): string | undefined => {
  const candidates = [
    tradeline.creditorName,
    tradeline.collectionAgencyName,
    tradeline.originalCreditorName,
  ];
  for (const candidate of candidates) {
    if (isMeaningfulName(candidate)) {
      return candidate.trim();
    }
  }
  return undefined;
};

/**
 * Safely formats a Date object to an ISO string for strict schema fields.
 */
const formatDate = (d: Date | null | undefined): string | undefined => {
  if (!d) return undefined;
  try {
    return d.toISOString();
  } catch (e) {
    return undefined;
  }
};

/**
 * Unified extraction function that maps DocStrange LLM results once to a Comprehensive result,
 * then derives and validates both Pass A and Pass A_FULL draft extractions cleanly.
 *
 * @param llmData The raw LLM Response from DocStrange extraction
 * @param rawText The raw text extracted directly from the HTML/PDF
 * @param artifactId The ID of the Report Artifact being processed
 * @returns Unified extraction container holding comprehensive, passA, and fullExtraction structures
 */
export function unifiedExtract(
  llmData: LLMResponse,
  rawText: string,
  artifactId: number
): UnifiedExtractionResult {
  // 1. Get comprehensive result once
  const comprehensive = mapDocStrangeResponseToResult(llmData, rawText);

  const raw_evidence: RawEvidenceItem[] = [];
  const addEv = (path: string, val: any) => {
    if (val !== undefined && val !== null && val !== "") {
      raw_evidence.push({
        path,
        value: val,
        confidence: 0.75,
        evidence: {
          page_number: 1,
          source_method: "ai_vision",
          snippet: evidenceSnippet(val),
        },
      });
    }
  };

  // 2. Map Bureau Context
  const bureau_context: any = {};
  const sourceBureauName =
    comprehensive.sourceBureau?.bureauName || llmData.bureau;
  if (sourceBureauName) {
    bureau_context.bureau_name = createEv(sourceBureauName);
    addEv("bureau_context.bureau_name", sourceBureauName);
  }

  const reportDateIso =
    formatDate(comprehensive.reportMetadata?.reportDate) ||
    formatDate(llmData.reportDate ? new Date(llmData.reportDate) : null);

  if (reportDateIso) {
    bureau_context.report_generated_at = createEv(reportDateIso);
    addEv("bureau_context.report_generated_at", reportDateIso);
  }

  // 3. Map Consumer Profile
  const consumer_profile: any = {
    address_history: [],
    phone_history: [],
    employment_history: [],
  };

  const cInfo = comprehensive.consumerInfo;
  if (cInfo) {
    let given: string | undefined;
    let middle: string | undefined;
    let sur: string | undefined;

    if (llmData.personalInfo && (llmData.personalInfo.givenNames || llmData.personalInfo.surname)) {
            given = llmData.personalInfo.givenNames || undefined;
      middle = llmData.personalInfo.middleName || undefined;
      sur = llmData.personalInfo.surname || undefined;
    } else if (cInfo.fullName) {
      const parts = cInfo.fullName.trim().split(/\s+/);
      if (parts.length === 1) {
        given = parts[0];
      } else {
        given = parts[0];
        sur = parts[parts.length - 1];
        if (parts.length > 2) {
          middle = parts.slice(1, -1).join(" ");
        }
      }
    }

    if (given || sur) {
      consumer_profile.legal_name = {
        given_name: createEv(given),
        surname: createEv(sur),
      };
      if (middle) {
        consumer_profile.legal_name.middle_name = createEv(middle);
      }
      if (given) addEv("consumer_profile.legal_name.given_name", given);
      if (sur) addEv("consumer_profile.legal_name.surname", sur);
      if (middle) addEv("consumer_profile.legal_name.middle_name", middle);
    }

    if (cInfo.sinLastDigits) {
      consumer_profile.social_insurance_number = createEv(cInfo.sinLastDigits);
      addEv("consumer_profile.social_insurance_number", cInfo.sinLastDigits);
    }

    if (cInfo.dateOfBirth) {
      const dobIso = formatDate(cInfo.dateOfBirth);
      consumer_profile.date_of_birth = createEv(dobIso);
      addEv("consumer_profile.date_of_birth", dobIso);
    } else if (cInfo.dateOfBirthRaw) {
      consumer_profile.date_of_birth = createEv(cInfo.dateOfBirthRaw);
      addEv("consumer_profile.date_of_birth", cInfo.dateOfBirthRaw);
    }

    // Addresses mapping
    if (cInfo.addressLine1) {
      consumer_profile.address_history.push({
        address_line_1: createEv(cInfo.addressLine1),
        city: createEv(cInfo.city),
        province: createEv(cInfo.province),
        postal_code: createEv(cInfo.postalCode),
        status: createEv("Current"),
      });
      addEv("consumer_profile.address_history[0].address_line_1", cInfo.addressLine1);
    }

    if (Array.isArray(cInfo.previousAddresses)) {
      cInfo.previousAddresses.forEach((addr, idx) => {
              if (addr.addressLine1) {
          const addrString = addr.addressLine1;
          consumer_profile.address_history.push({
            address_line_1: createEv(addrString),
            city: createEv(addr.city),
            province: createEv(addr.province),
            postal_code: createEv(addr.postalCode),
                        // ExtractedAddress doesn't carry dateReported
            status: createEv("Previous"),
          });
          addEv(`consumer_profile.address_history[${idx + 1}].address_line_1`, addrString);
        }
      });
    }

    // Phones mapping
    if (cInfo.phone) {
      consumer_profile.phone_history.push({
        phone_number: createEv(cInfo.phone),
      });
      addEv("consumer_profile.phone_history[0].phone_number", cInfo.phone);
    }
    if (cInfo.phoneSecondary) {
      const idx = consumer_profile.phone_history.length;
      consumer_profile.phone_history.push({
        phone_number: createEv(cInfo.phoneSecondary),
      });
      addEv(`consumer_profile.phone_history[${idx}].phone_number`, cInfo.phoneSecondary);
    }
  }

  // Employments mapping
  if (Array.isArray(comprehensive.employmentInfo)) {
    comprehensive.employmentInfo.forEach((emp, idx) => {
      if (emp.employerName) {
        consumer_profile.employment_history.push({
          employer_name: createEv(emp.employerName),
          occupation: createEv(emp.occupation),
          hire_date: createEv(formatDate(emp.hireDate)),
          verification_date: createEv(formatDate(emp.verifiedDate)),
          status: createEv(
            emp.isCurrent === true
              ? "Current"
              : emp.isCurrent === false
              ? "Previous"
              : emp.employmentStatus?.toLowerCase().includes("previous")
              ? "Previous"
              : emp.employmentStatus?.toLowerCase().includes("current")
              ? "Current"
              : undefined
          ),
        });
        addEv(`consumer_profile.employment_history[${idx}].employer_name`, emp.employerName);
      }
    });
  }

  // Base shared properties
  const basePassProps = {
    channel_guess: sourceBureauName || null,
    bureau_context,
    consumer_profile,
    raw_evidence,
    conflicts: [],
    missing_required_fields: [],
    quality_notes: [],
    extracted_at: new Date().toISOString(),
    doc_id: artifactId,
  };

  // Derive Pass A
  let passA = {
    ...basePassProps,
    schema: "urn:compnd:schemas:pass-a-draft-extraction:v1",
    pass: "A",
  } as PassADraftExtraction;

  // Utilize the pre-existing validator/enricher designed specifically for Pass A arrays/doc_id
  passA = enrichExtractionWithSystemFields(passA, artifactId);
  const validationResult = validatePassAExtraction(passA);
  if (!validationResult.isValid) {
    console.warn("[UnifiedExtractor] Pass A Validation failed, proceeding with best effort:", validationResult.error);
  }

  // 4. Map Accounts for Full Extraction
  const accounts: AccountExtraction[] = comprehensive.tradelines.map((t) => ({
    creditor_name: createEv(resolveCreditorNameForExtraction(t))!,
    account_number_partial: createEv(t.accountNumber),
    account_type: createEv(t.accountType),
    responsibility: createEv(t.responsibilityCode),
    date_opened: createEv(formatDate(t.dates?.opened)),
    date_closed: createEv(formatDate(t.dates?.closed)),
    date_reported: createEv(formatDate(t.dates?.reported)),
    date_last_activity: createEv(formatDate(t.lastActivityDate)),
    date_last_payment: createEv(formatDate(t.lastPaymentDate)),
    date_first_delinquency: createEv(formatDate(t.dates?.dofd)),
    high_credit: createEv(t.amounts?.high),
    credit_limit: createEv(t.creditLimit),
    balance: createEv(t.balance),
    amount_past_due: createEv(t.amounts?.pastDue),
    monthly_payment: createEv(t.monthlyPayment),
    actual_payment: createEv(t.lastPaymentAmount),
    status: createEv(t.status),
    narrative_codes: t.remarkCodes?.length
      ? t.remarkCodes.map((c) => createEv(c)!).filter(Boolean)
      : undefined,
    terms: createEv(t.terms),
    payment_history_profile: createEv(t.paymentPattern),
    months_reviewed: createEv((t as any).monthsReviewed),
    times_30_days_late: createEv((t as any).paymentHistory?.['30']),
    times_60_days_late: createEv((t as any).paymentHistory?.['60']),
    times_90_days_late: createEv((t as any).paymentHistory?.['90']),
  } as unknown as AccountExtraction));

  // 5. Map Inquiries for Full Extraction
  const inquiries_credit_related: InquiryExtraction[] = [];
  const inquiries_other: InquiryExtraction[] = [];
  comprehensive.inquiries.forEach((inq) => {
    const inqObj: InquiryExtraction = {
      inquirer_name: createEv(inq.creditorName) || {
        value: "Unknown",
        confidence: 0,
        evidence: { page_number: 1, source_method: "ai_vision", snippet: "" },
      },
      inquiry_date: createEv(formatDate(inq.inquiryDate)) || {
        value: "",
        confidence: 0,
        evidence: { page_number: 1, source_method: "ai_vision", snippet: "" },
      },
      inquiry_type: createEv(inq.inquiryType),
    };
    if (inq.inquiryType === "hard") {
      inquiries_credit_related.push(inqObj);
    } else {
      inquiries_other.push(inqObj);
    }
  });

  // 6. Map Public Records for Full Extraction
  const public_records: PublicRecordExtraction[] = comprehensive.publicRecords.map((pr) => ({
    record_type: createEv(pr.recordType) || {
      value: "other",
      confidence: 0,
      evidence: { page_number: 1, source_method: "ai_vision", snippet: "" },
    },
    filing_date: createEv(formatDate(pr.filingDate)),
    court_name: createEv(pr.courtName),
    case_number: createEv(pr.caseNumber),
    status: createEv(pr.status),
    amount: createEv(pr.amount),
  }));

  const insolvency_public_records = {
    section_present: public_records.length > 0,
    records: public_records,
  };

  // Derive Full Draft (A_FULL)
  const fullExtraction: FullDraftExtraction = {
    ...basePassProps,
    schema: "urn:compnd:schemas:tu-full-draft-extraction:v1",
    pass: "A_FULL",
    portal_summary: {}, // Safely default empty structure based on extraction needs
    accounts,
    inquiries_credit_related,
    inquiries_other,
    insolvency_public_records,
  } as FullDraftExtraction;

  return {
    comprehensive,
    passA,
    fullExtraction,
  };
}
