import { db } from "./db";
import { sql } from "kysely";
import {
  ExtractedConsumerInfo,
  ExtractedAddress,
} from "./consumerInfoExtractorTypes";
import { ExtractedCreditScore } from "./creditScoreExtractor";
import { ExtractedInquiry } from "./inquiryExtractor";
import { ExtractedPublicRecord } from "./publicRecordExtractor";
import { ExtractedConsumerStatement } from "./consumerStatementExtractor";
import { ExtractedEmploymentInfo } from "./employmentExtractor";
import { ExtractedPaymentHistory } from "./paymentHistoryExtractor";
import {
  InquiryType,
  PublicRecordType,
  ConsumerStatementType,
  CanadianProvince,
} from "./schema";
import {
  normalizeCreditReportAmount,
  normalizeCreditReportAmountString,
  normalizePaymentHistoryCount,
} from "./creditReportNumberSanitizer";

export type ComprehensiveStorageResult = {
  consumerInfoId: number | null;
  creditScoreIds: number[];
  inquiryIds: number[];
  publicRecordIds: number[];
  consumerStatementIds: number[];
  employmentInfoIds: number[];
  paymentHistoryIds: number[];
  errors: string[];
};

type PaymentHistoryDetailLike = {
  date?: string | null;
  balance?: number | string | null;
  payment?: number | string | null;
  pastDue?: number | string | null;
  highCredit?: number | string | null;
  creditLimit?: number | string | null;
  balloonPayment?: number | string | null;
  chargeOff?: number | string | null;
  mop?: string | null;
  terms?: string | null;
  narrative?: string | null;
};

/**
 * Stores all extracted data from a comprehensive credit report into the database.
 * Handles partial failures by logging errors and continuing with other sections.
 */
export async function storeComprehensiveReportData(params: {
  reportArtifactId: number;
  rawText: string;
  extractedConsumerInfo: ExtractedConsumerInfo | null;
  extractedCreditScores: ExtractedCreditScore[];
  extractedInquiries: ExtractedInquiry[];
  extractedPublicRecords: ExtractedPublicRecord[];
  extractedConsumerStatements: ExtractedConsumerStatement[];
  extractedEmploymentInfo: ExtractedEmploymentInfo[];
  tradelinePaymentHistories: Array<{
    tradelineId: number;
    paymentHistory: ExtractedPaymentHistory;
  }>;
}): Promise<ComprehensiveStorageResult> {
  const {
    reportArtifactId,
    extractedConsumerInfo,
    extractedCreditScores,
    extractedInquiries,
    extractedPublicRecords,
    extractedConsumerStatements,
    extractedEmploymentInfo,
    tradelinePaymentHistories,
  } = params;

  const result: ComprehensiveStorageResult = {
    consumerInfoId: null,
    creditScoreIds: [],
    inquiryIds: [],
    publicRecordIds: [],
    consumerStatementIds: [],
    employmentInfoIds: [],
    paymentHistoryIds: [],
    errors: [],
  };

  // 1. Store Consumer Info
  if (extractedConsumerInfo) {
    try {
      const nameParts = parsePersonName(extractedConsumerInfo.fullName);
      
      // Prepare previous addresses for JSON storage
      // Ensure it's a valid JSON array
      const previousAddressesJson = extractedConsumerInfo.previousAddresses 
        ? JSON.parse(JSON.stringify(extractedConsumerInfo.previousAddresses)) 
        : [];

      const insertedInfo = await db
        .insertInto("reportConsumerInfo")
        .values({
          reportArtifactId,
          fullName: extractedConsumerInfo.fullName,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          middleName: nameParts.middleName,
          suffix: nameParts.suffix,
          addressLine1: extractedConsumerInfo.addressLine1,
          addressLine2: extractedConsumerInfo.addressLine2,
          city: extractedConsumerInfo.city,
          province: extractedConsumerInfo.province,
          postalCode: extractedConsumerInfo.postalCode,
          dateOfBirth: extractedConsumerInfo.dateOfBirth,
          dateOfBirthRaw: extractedConsumerInfo.dateOfBirthRaw,
          phone: extractedConsumerInfo.phone,
          phoneSecondary: extractedConsumerInfo.phoneSecondary ?? null,
          sinLastDigits: extractedConsumerInfo.sinLastDigits ?? null,
          previousAddresses: previousAddressesJson,
          confidenceScore: extractedConsumerInfo.confidence,
          region: "CA",
          // Note: rawSectionText is not available in ExtractedConsumerInfo type
          rawSectionText: null, 
        })
        .returning("id")
        .executeTakeFirst();

      if (insertedInfo) {
        result.consumerInfoId = insertedInfo.id;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to store consumer info:", err);
      result.errors.push(`Consumer Info: ${msg}`);
    }
  }

  // 2. Store Credit Scores
  for (const score of extractedCreditScores) {
    try {
      const insertedScore = await db
        .insertInto("reportCreditScore")
        .values({
          reportArtifactId,
          scoreType: score.scoreType,
          scoreValue: score.scoreValue,
          scoreDate: score.scoreDate,
          scoreRangeMin: score.scoreRangeMin,
          scoreRangeMax: score.scoreRangeMax,
          scoreFactors: JSON.stringify(score.scoreFactors),
          bureauName: score.bureauName,
          rawSectionText: score.rawSectionText,
          region: "CA",
        })
        .returning("id")
        .executeTakeFirst();

      if (insertedScore) {
        result.creditScoreIds.push(insertedScore.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to store credit score:", err);
      result.errors.push(`Credit Score (${score.scoreType}): ${msg}`);
    }
  }

  // 3. Store Inquiries
  for (const inquiry of extractedInquiries) {
    try {
      // Map string to InquiryType enum safely
      const inquiryType = mapInquiryType(inquiry.inquiryType);

      const insertedInquiry = await db
        .insertInto("reportInquiry")
        .values({
          reportArtifactId,
          inquiryType,
          creditorName: inquiry.creditorName,
          inquiryDate: inquiry.inquiryDate,
          inquiryPurpose: inquiry.inquiryPurpose,
          subscriberCode: inquiry.subscriberCode,
          industryCode: inquiry.industryCode,
          rawSectionText: inquiry.rawSectionText,
          region: "CA",
        })
        .returning("id")
        .executeTakeFirst();

      if (insertedInquiry) {
        result.inquiryIds.push(insertedInquiry.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to store inquiry:", err);
      result.errors.push(`Inquiry (${inquiry.creditorName}): ${msg}`);
    }
  }

  // 4. Store Public Records
  for (const record of extractedPublicRecords) {
    try {
      const recordType = mapPublicRecordType(record.recordType);

      const insertedRecord = await db
        .insertInto("reportPublicRecord")
        .values({
          reportArtifactId,
          recordType,
          filingDate: record.filingDate,
          dischargeDate: record.dischargeDate,
          amount: normalizeCreditReportAmountString(record.amount, "reportPublicRecord.amount"),
          caseNumber: record.caseNumber,
          courtName: record.courtName,
          status: record.status,
          plaintiff: record.plaintiff,
          rawSectionText: record.rawSectionText,
          region: "CA",
        })
        .returning("id")
        .executeTakeFirst();

      if (insertedRecord) {
        result.publicRecordIds.push(insertedRecord.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to store public record:", err);
      result.errors.push(`Public Record (${record.recordType}): ${msg}`);
    }
  }

  // 5. Store Consumer Statements
  for (const statement of extractedConsumerStatements) {
    try {
      const statementType = mapConsumerStatementType(statement.statementType);

      const insertedStatement = await db
        .insertInto("reportConsumerStatement")
        .values({
          reportArtifactId,
          statementType,
          statementText: statement.statementText,
          effectiveDate: statement.effectiveDate,
          expirationDate: statement.expirationDate,
          addedDate: statement.addedDate,
          rawSectionText: statement.rawSectionText,
          region: "CA",
        })
        .returning("id")
        .executeTakeFirst();

      if (insertedStatement) {
        result.consumerStatementIds.push(insertedStatement.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to store consumer statement:", err);
      result.errors.push(`Consumer Statement (${statement.statementType}): ${msg}`);
    }
  }

  // 6. Store Employment Info
  for (const employment of extractedEmploymentInfo) {
    try {
      const insertedEmployment = await db
        .insertInto("reportEmploymentInfo")
        .values({
          reportArtifactId,
          employerName: employment.employerName,
          occupation: employment.occupation,
          employmentStatus: employment.employmentStatus,
          salary: normalizeCreditReportAmountString(employment.salary, "reportEmploymentInfo.salary"),
          salaryFrequency: employment.salaryFrequency,
          hireDate: employment.hireDate,
          terminationDate: employment.terminationDate,
          verifiedDate: employment.verifiedDate,
          employerAddress: employment.employerAddress,
          employerCity: employment.employerCity,
          employerProvince: employment.employerProvince,
          employerPostalCode: employment.employerPostalCode,
          // employerPhone is not in ExtractedEmploymentInfo but is in DB schema. 
          // We'll leave it null as it's not extracted.
          isCurrent: employment.isCurrent,
          rawSectionText: employment.rawSectionText,
          region: "CA",
        })
        .returning("id")
        .executeTakeFirst();

      if (insertedEmployment) {
        result.employmentInfoIds.push(insertedEmployment.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to store employment info:", err);
      result.errors.push(`Employment Info (${employment.employerName}): ${msg}`);
    }
  }

  // 7. Store Payment Histories (Upsert Logic)
  console.log("[Storage] Payment histories received:", tradelinePaymentHistories.length);
  for (const item of tradelinePaymentHistories) {
    const { tradelineId, paymentHistory } = item;
    try {
      // Check if a record already exists for this tradeline and report artifact
      const existingRecord = await db
        .selectFrom("tradelinePaymentHistory")
        .select("id")
        .where("tradelineId", "=", tradelineId)
        .where("reportArtifactId", "=", reportArtifactId)
        .executeTakeFirst();

      const summary = (paymentHistory as any).paymentHistorySummary;
      let times30 = paymentHistory.times30DaysLate;
      let times60 = paymentHistory.times60DaysLate;
      let times90 = paymentHistory.times90DaysLate;

      if (summary) {
        if (times30 === null && summary["30"] != null) times30 = normalizePaymentHistoryCount(summary["30"], "tradelinePaymentHistory.times30DaysLate");
        if (times60 === null && summary["60"] != null) times60 = normalizePaymentHistoryCount(summary["60"], "tradelinePaymentHistory.times60DaysLate");
        if (times90 === null && summary["90"] != null) times90 = normalizePaymentHistoryCount(summary["90"], "tradelinePaymentHistory.times90DaysLate");
      }

      times30 = normalizePaymentHistoryCount(times30, "tradelinePaymentHistory.times30DaysLate");
      times60 = normalizePaymentHistoryCount(times60, "tradelinePaymentHistory.times60DaysLate");
      times90 = normalizePaymentHistoryCount(times90, "tradelinePaymentHistory.times90DaysLate");
      const times120 = normalizePaymentHistoryCount(paymentHistory.times120DaysLate, "tradelinePaymentHistory.times120DaysLate");
      const monthsReviewed = normalizePaymentHistoryCount(
        (paymentHistory as any).monthsReviewed ?? summary?.["#M"],
        "tradeline.monthsReviewed",
      );

      const derivedPaymentPattern =
        paymentHistory.paymentPattern ??
        buildSummaryPaymentPattern(times30, times60, times90, times120, monthsReviewed);

      const payload = {
        tradelineId,
        reportArtifactId,
        paymentPattern: derivedPaymentPattern,
        responsibilityCode: paymentHistory.responsibilityCode,
        ecoaCode: paymentHistory.ecoaCode,
        complianceConditionCode: paymentHistory.complianceConditionCode,
        specialCommentCodes: paymentHistory.specialCommentCodes as any,
        worstDelinquencyCode: paymentHistory.worstDelinquencyCode,
        worstDelinquencyDate: paymentHistory.worstDelinquencyDate,
        accountCondition: paymentHistory.accountCondition,
        monthlyPayment: normalizeCreditReportAmountString(paymentHistory.monthlyPayment, "tradelinePaymentHistory.monthlyPayment"),
        lastPaymentAmount: normalizeCreditReportAmountString(paymentHistory.lastPaymentAmount, "tradelinePaymentHistory.lastPaymentAmount"),
        lastActivityDate: paymentHistory.lastActivityDate,
        lastReportedDate: paymentHistory.lastReportedDate,
        rawSectionText: paymentHistory.rawSectionText,
        region: "CA",
      };

      console.log("[Storage] Storing payment history for tradeline", tradelineId, "artifact", reportArtifactId);

      let recordId: number;

      if (existingRecord) {
        // Update existing
        await db
          .updateTable("tradelinePaymentHistory")
          .set(payload)
          .where("id", "=", existingRecord.id)
          .execute();
        recordId = existingRecord.id;
      } else {
        // Insert new
        const inserted = await db
          .insertInto("tradelinePaymentHistory")
          .values(payload)
          .returning("id")
          .executeTakeFirstOrThrow();
        recordId = inserted.id;
      }

      // Update the fields with numbers in their names via raw SQL 
      // because Kysely's CamelCasePlugin translates times30DaysLate to times30_days_late instead of times_30_days_late
      await sql`
        UPDATE tradeline_payment_history
        SET 
          times_30_days_late = ${times30},
          times_60_days_late = ${times60},
          times_90_days_late = ${times90},
          times_120_days_late = ${times120}
        WHERE id = ${recordId}
      `.execute(db);

      console.log("[Storage] Successfully stored payment history ID:", recordId);
      result.paymentHistoryIds.push(recordId);

      const paymentSummaryTradelineUpdates: Record<string, unknown> = {};
      if (derivedPaymentPattern) {
        paymentSummaryTradelineUpdates.paymentPattern = derivedPaymentPattern;
        paymentSummaryTradelineUpdates.paymentHistoryProfile = derivedPaymentPattern;
      }
      if (monthsReviewed !== null) {
        paymentSummaryTradelineUpdates.monthsReviewed = String(monthsReviewed);
      }

      if (Object.keys(paymentSummaryTradelineUpdates).length > 0) {
        await db
          .updateTable("tradeline")
          .set(paymentSummaryTradelineUpdates)
          .where("id", "=", tradelineId)
          .execute();
      }

      // 8. Store Payment History Details
      const details = (paymentHistory as any).paymentHistoryDetails;
      if (Array.isArray(details) && details.length > 0) {
        await db
          .deleteFrom("tradelinePaymentHistoryDetail")
          .where("tradelineId", "=", tradelineId)
          .where("reportArtifactId", "=", reportArtifactId)
          .execute();

        const detailRows = details.map((d: any) => ({
          tradelineId,
          reportArtifactId,
          periodDate: parsePeriodDate(d.date),
          balance: normalizeCreditReportAmountString(d.balance, "tradelinePaymentHistoryDetail.balance"),
          payment: normalizeCreditReportAmountString(d.payment, "tradelinePaymentHistoryDetail.payment"),
          pastDue: normalizeCreditReportAmountString(d.pastDue, "tradelinePaymentHistoryDetail.pastDue"),
          highCredit: normalizeCreditReportAmountString(d.highCredit, "tradelinePaymentHistoryDetail.highCredit"),
          creditLimit: normalizeCreditReportAmountString(d.creditLimit, "tradelinePaymentHistoryDetail.creditLimit"),
          balloonPayment: normalizeCreditReportAmountString(d.balloonPayment, "tradelinePaymentHistoryDetail.balloonPayment"),
          chargeOff: normalizeCreditReportAmountString(d.chargeOff, "tradelinePaymentHistoryDetail.chargeOff"),
          mop: d.mop || null,
          terms: d.terms || null,
          narrative: d.narrative || null,
          region: "CA" as const,
        }));

        await db
          .insertInto("tradelinePaymentHistoryDetail")
          .values(detailRows)
          .execute();

        const latestDetail = pickLatestPaymentHistoryDetail(details);
        const detailBalance = normalizeCreditReportAmount(latestDetail?.balance, "tradeline.balance");
        const detailPastDue = normalizeCreditReportAmount(latestDetail?.pastDue, "tradeline.amountPastDue");
        const detailHighCredit = normalizeCreditReportAmount(latestDetail?.highCredit, "tradeline.highCredit");
        const detailCreditLimit = normalizeCreditReportAmount(latestDetail?.creditLimit, "tradeline.creditLimit");
        const detailMop = cleanMeaningfulString(latestDetail?.mop);
        const detailTerms = cleanMeaningfulString(latestDetail?.terms);

        const tradelineFallbackUpdates: Record<string, unknown> = {};
        if (detailBalance !== null) {
          tradelineFallbackUpdates.balance = detailBalance;
          tradelineFallbackUpdates.currentBalance = detailBalance;
        }
        if (detailPastDue !== null) tradelineFallbackUpdates.amountPastDue = detailPastDue;
        if (detailHighCredit !== null && detailHighCredit > 0) tradelineFallbackUpdates.highCredit = detailHighCredit;
        if (detailCreditLimit !== null && detailCreditLimit > 0) tradelineFallbackUpdates.creditLimit = detailCreditLimit;
        if (detailMop) tradelineFallbackUpdates.mop = detailMop;
        if (detailTerms) tradelineFallbackUpdates.terms = detailTerms;
        if (derivedPaymentPattern) {
          tradelineFallbackUpdates.paymentPattern = derivedPaymentPattern;
          tradelineFallbackUpdates.paymentHistoryProfile = derivedPaymentPattern;
        }
        if (monthsReviewed !== null) tradelineFallbackUpdates.monthsReviewed = String(monthsReviewed);
        if (paymentHistory.lastReportedDate) tradelineFallbackUpdates.lastReportedDate = paymentHistory.lastReportedDate;
        if (paymentHistory.lastActivityDate) tradelineFallbackUpdates.lastActivityDate = paymentHistory.lastActivityDate;
        if (paymentHistory.lastPaymentDate) tradelineFallbackUpdates.dateOfLastPayment = paymentHistory.lastPaymentDate;
        if (paymentHistory.lastPaymentAmount != null) {
          const normalizedLastPaymentAmount = normalizeCreditReportAmount(paymentHistory.lastPaymentAmount, "tradeline.lastPaymentAmount");
          if (normalizedLastPaymentAmount !== null) {
            tradelineFallbackUpdates.lastPaymentAmount = normalizedLastPaymentAmount;
          }
        }
        if (paymentHistory.monthlyPayment != null) {
          const normalizedMonthlyPayment = normalizeCreditReportAmount(paymentHistory.monthlyPayment, "tradeline.monthlyPayment");
          if (normalizedMonthlyPayment !== null) {
            tradelineFallbackUpdates.monthlyPayment = normalizedMonthlyPayment;
          }
        }

        if (Object.keys(tradelineFallbackUpdates).length > 0) {
          await db
            .updateTable("tradeline")
            .set(tradelineFallbackUpdates)
            .where("id", "=", tradelineId)
            .execute();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Storage] Failed to store payment history for tradeline", tradelineId, ":", err);
      result.errors.push(`Payment History (Tradeline ${tradelineId}): ${msg}`);
    }
  }

  return result;
}

// --- Helpers ---

function parsePersonName(fullName: string | null): {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  suffix: string | null;
} {
  if (!fullName) {
    return { firstName: null, lastName: null, middleName: null, suffix: null };
  }

  const cleanName = fullName.trim();
  const parts = cleanName.split(/\s+/);
  
  let firstName: string | null = null;
  let lastName: string | null = null;
  let middleName: string | null = null;
  let suffix: string | null = null;

  // Check for suffix
  const suffixes = ["JR", "SR", "II", "III", "IV", "V", "ESQ", "MD", "PHD"];
  if (parts.length > 1 && suffixes.includes(parts[parts.length - 1].toUpperCase().replace(/\./g, ""))) {
    suffix = parts.pop() || null;
  }

  if (parts.length === 1) {
    lastName = parts[0];
  } else if (parts.length === 2) {
    // Assume "First Last" unless comma indicates "Last, First"
    if (parts[0].includes(",")) {
      lastName = parts[0].replace(",", "");
      firstName = parts[1];
    } else {
      firstName = parts[0];
      lastName = parts[1];
    }
  } else {
    // 3 or more parts
    if (parts[0].includes(",")) {
      // "Last, First Middle"
      lastName = parts[0].replace(",", "");
      firstName = parts[1];
      middleName = parts.slice(2).join(" ");
    } else {
      // "First Middle Last"
      firstName = parts[0];
      lastName = parts[parts.length - 1];
      middleName = parts.slice(1, parts.length - 1).join(" ");
    }
  }

  return { firstName, lastName, middleName, suffix };
}

function parsePeriodDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // try basic parse
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  // Handle "MM/YYYY" or "YYYY/MM"
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 2) {
    let year = 0;
    let month = 0;
    if (parts[0].length === 4) {
       year = parseInt(parts[0], 10);
       month = parseInt(parts[1], 10) - 1;
    } else if (parts[1].length === 4) {
       month = parseInt(parts[0], 10) - 1;
       year = parseInt(parts[1], 10);
    }
    if (year > 0 && month >= 0 && month <= 11) {
       return new Date(year, month, 1);
    }
  }

  return null;
}

function cleanMeaningfulString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "-") return null;
  return normalized;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSummaryPaymentPattern(
  times30: number | null,
  times60: number | null,
  times90: number | null,
  times120: number | null,
  monthsReviewed: number | null = null,
): string | null {
  if (times30 == null || times60 == null || times90 == null) return null;
  const months = monthsReviewed ?? [times30, times60, times90, times120 ?? 0]
    .map((value) => (Number.isFinite(value) ? Number(value) : 0))
    .reduce((sum, value) => sum + Math.max(0, value), 0);
  return `30d:${Math.max(0, times30)} 60d:${Math.max(0, times60)} 90d:${Math.max(0, times90)} months:${Math.max(0, months)}`;
}

function pickLatestPaymentHistoryDetail(details: PaymentHistoryDetailLike[]): PaymentHistoryDetailLike | null {
  if (!Array.isArray(details) || details.length === 0) return null;

  const withOrder = details
    .map((detail, index) => ({
      detail,
      index,
      time: parsePeriodDate(detail.date ?? null)?.getTime() ?? Number.NEGATIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.time !== b.time) return b.time - a.time;
      return a.index - b.index;
    });

  const firstWithFinancialData = withOrder.find(({ detail }) => {
    return (
      toNumberOrNull(detail.balance) !== null ||
      toNumberOrNull(detail.pastDue) !== null ||
      toNumberOrNull(detail.highCredit) !== null ||
      toNumberOrNull(detail.creditLimit) !== null
    );
  });

  return firstWithFinancialData?.detail ?? withOrder[0]?.detail ?? null;
}

function mapInquiryType(type: string): InquiryType {
  const normalized = type.toLowerCase();
  if (normalized.includes("hard") || normalized.includes("regular")) return "hard";
  if (normalized.includes("soft") || normalized.includes("review")) return "soft";
  if (normalized.includes("promo")) return "promotional";
  if (normalized.includes("account")) return "account_review";
  return "unknown";
}

function mapPublicRecordType(type: string): PublicRecordType {
  const normalized = type.toLowerCase();
  if (normalized.includes("bankruptcy") || normalized.includes("proposal")) return "bankruptcy";
  if (normalized.includes("judgment")) return "judgment";
  if (normalized.includes("civil")) return "civil_judgment";
  if (normalized.includes("foreclosure")) return "foreclosure";
  if (normalized.includes("lien")) return "tax_lien";
  if (normalized.includes("garnishment")) return "wage_garnishment";
  return "other";
}

function mapConsumerStatementType(type: string): ConsumerStatementType {
  const normalized = type.toLowerCase();
  if (normalized.includes("dispute")) return "dispute";
  if (normalized.includes("fraud")) return "fraud_alert";
  if (normalized.includes("active duty")) return "active_duty_alert";
  if (normalized.includes("identity theft")) return "identity_theft";
  if (normalized.includes("freeze")) return "security_freeze";
  return "general_statement";
}
