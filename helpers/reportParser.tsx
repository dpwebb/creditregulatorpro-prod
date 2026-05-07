import { extractTextFromPdf } from "./pdfTextExtractor";
import { extractTradelines } from "./transunionPdfExtractor";
import {
  extractIsCollectionAccount,
  extractCollectionAgencyName,
  extractCollectionTurnoverSignal,
} from "./tradelineBasicInfoExtractors";
import {
  extractResponsibilityCode,
  extractEcoaCode,
} from "./tradelineAccountTypeExtractors";
import {
  extractOriginalBalance,
  extractMonthlyPayment,
  extractLastPaymentAmount,
  extractBalance,
  extractCreditLimit,
  extractBalanceAsync,
  extractAmountsAsync,
  extractCreditLimitAsync,
  extractMopAsync,
} from "./tradelineAmountExtractors";
import {
  extractDateAssignedToCollection,
  extractLastActivityDate,
  extractLastPaymentDate,
  extractMaturityDate,
  extractPostedDate,
  extractChargeOffDate,
  extractBalloonPaymentDate,
} from "./tradelineDateExtractors";
import {
  extractInterestRate,
  extractTerms,
  extractPaymentPattern,
} from "./tradelineOtherExtractors";
import { detectBureauFromText } from "./bureauDetector";
import { isEquifaxFormat } from "./equifaxReportParser";
import { extractEquifaxTradelines } from "./equifaxPdfExtractor";
import { resolveCreditorEntity } from "./creditorEntityResolver";
import { extractReportMetadata } from "./reportMetadataExtractor";
import { extractConsumerInfo } from "./consumerInfoExtractor";
import { extractCreditScores } from "./creditScoreExtractor";
import { extractInquiries } from "./inquiryExtractor";
import { extractPublicRecords } from "./publicRecordExtractor";
import { extractConsumerStatements } from "./consumerStatementExtractor";
import { extractEmploymentInfo } from "./employmentExtractor";
import { extractPaymentHistory } from "./paymentHistoryExtractor";
import {
  ParsedTradeline,
  ParseResult,
  ComprehensiveParseResult,
  ExtractedReportMetadata,
  ExtractedPaymentHistory
} from "./reportParserTypes";
import { normalizeTransUnionPaymentTerms } from "./transunionPaymentTerms";

// Re-export everything from types to maintain backward compatibility
export * from "./reportParserTypes";

export interface ParseReportOptions {
  allowOcrFallback?: boolean;
  enableAiAugmentation?: boolean;
  logRawTextPreview?: boolean;
}

export const DEFAULT_LOG_RAW_TEXT_PREVIEW = false;

/**
 * Detects if a tradeline section contains a payment history grid.
 * Payment grids typically have month/year patterns followed by numeric values.
 */
function hasPaymentHistoryGrid(text: string): boolean {
  // Look for patterns like "Jan 2024", "01/24", "Feb 2024" etc. that are common in payment grids
  const monthYearPatterns = [
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}\b/i,
    /\b\d{2}\/\d{2}\b.*\b\d{2}\/\d{2}\b/,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}/i,
  ];

  // Check if we have at least two month/year occurrences (suggesting a timeline/grid)
  for (const pattern of monthYearPatterns) {
    const matches = text.match(new RegExp(pattern, 'gi'));
    if (matches && matches.length >= 2) {
      // Additionally check for numeric values nearby (balance, payment amounts)
      const hasNumbers = /\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/.test(text);
      if (hasNumbers) {
        return true;
      }
    }
  }

  return false;
}

function amountsWithinTolerance(a: number | null | undefined, b: number | null | undefined, tolerance = 0.35): boolean {
  if (a == null || b == null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return true;
  return Math.abs(a - b) / max <= tolerance;
}

/**
 * Parses a raw credit report (provided as base64 data) into a comprehensive structured format.
 * Specifically designed for Canadian credit report formats (Equifax Canada, TransUnion Canada).
 * 
 * The process involves:
 * 1. Extracting raw text from the PDF buffer.
 * 2. Detecting the source bureau.
 * 3. Extracting consumer personal information.
 * 4. Extracting credit scores.
 * 5. Extracting inquiries.
 * 6. Extracting public records.
 * 7. Extracting consumer statements and alerts.
 * 8. Extracting employment information.
 * 9. Splitting text into tradeline sections and parsing each.
 * 10. Extracting payment history for each tradeline.
 *
 * @param base64Data The raw report data in base64 format (with or without data URL prefix).
 * @param mimeType The MIME type of the report. Currently, only 'application/pdf' is supported.
 * @returns A promise resolving to a ComprehensiveParseResult containing all extracted data.
 *          Returns empty arrays/null values if parsing fails or MIME type is unsupported.
 */
export async function parseReport(
  base64Data: string,
  mimeType: string,
  options: ParseReportOptions = {},
): Promise<ComprehensiveParseResult> {
  const allowOcrFallback = options.allowOcrFallback ?? false;
  const enableAiAugmentation = false;
  const logRawTextPreview = options.logRawTextPreview ?? DEFAULT_LOG_RAW_TEXT_PREVIEW;

  console.log(
    `[Report Parser] Starting comprehensive parse for ${mimeType} document (${base64Data.length} chars)`,
  );

  // Currently only PDF is supported
  if (mimeType !== "application/pdf") {
    console.warn(
      `[Report Parser] Unsupported MIME type: ${mimeType}. Only PDF is currently supported.`,
    );
    const emptyMetadata: ExtractedReportMetadata = {
      reportDate: null,
      reportNumber: null,
      fileNumber: null,
      bureauFileId: null,
      transUnionCaseId: null,
      bureauName: null,
      bureauPhone: null,
      bureauAddress: null,
      totalAccounts: null,
      openAccounts: null,
      closedAccounts: null,
      delinquentAccounts: null,
      derogatoryAccounts: null,
      totalBalances: null,
      totalCreditLimit: null,
      utilizationPercent: null,
      fraudAlertActive: false,
      securityFreezeActive: false,
      activeDisputePresent: false,
      militaryLendingActCovered: false,
      oldestAccountDate: null,
      newestAccountDate: null,
      averageAccountAge: null,
      rawHeaderText: null,
      confidence: 0,
    };
    
    return {
      tradelines: [],
      sourceBureau: null,
      consumerInfo: null,
      rawText: "",
      reportMetadata: emptyMetadata,
      creditScores: [],
      inquiries: [],
      publicRecords: [],
      consumerStatements: [],
      employmentInfo: [],
      paymentHistories: [],
    };
  }

  try {
    // Step 1: Extract text from PDF using the pdfTextExtractor helper
    console.log("[Report Parser] Step 1: Extracting text from PDF...");
    const text = await extractTextFromPdf(base64Data, { allowOcrFallback });

    if (!text || text.trim().length === 0) {
      console.warn("[Report Parser] No text extracted from PDF");
      const emptyMetadata: ExtractedReportMetadata = {
        reportDate: null,
        reportNumber: null,
        fileNumber: null,
        bureauFileId: null,
        transUnionCaseId: null,
        bureauName: null,
        bureauPhone: null,
        bureauAddress: null,
        totalAccounts: null,
        openAccounts: null,
        closedAccounts: null,
        delinquentAccounts: null,
        derogatoryAccounts: null,
        totalBalances: null,
        totalCreditLimit: null,
        utilizationPercent: null,
        fraudAlertActive: false,
        securityFreezeActive: false,
        activeDisputePresent: false,
        militaryLendingActCovered: false,
        oldestAccountDate: null,
        newestAccountDate: null,
        averageAccountAge: null,
        rawHeaderText: null,
        confidence: 0,
      };
      
      return {
        tradelines: [],
        sourceBureau: null,
        consumerInfo: null,
        rawText: "",
        reportMetadata: emptyMetadata,
        creditScores: [],
        inquiries: [],
        publicRecords: [],
        consumerStatements: [],
        employmentInfo: [],
        paymentHistories: [],
      };
    }

    console.log(`[Report Parser] Extracted ${text.length} characters of text`);
    // Add debug log to capture the structure of Credit Monitoring PDFs
    if (logRawTextPreview) {
      console.log(`[Report Parser] Raw Text Preview (first 3000 chars):\n${text.substring(0, 3000)}`);
    }

    // Step 2: Detect the source bureau
    console.log("[Report Parser] Step 2: Detecting source bureau...");
    const detectedBureau = detectBureauFromText(text);
    
    if (detectedBureau) {
      console.log(
        `[Report Parser] ✓ Detected bureau: ${detectedBureau.bureauName} (${detectedBureau.confidence}% confidence)`
      );
    } else {
      console.warn("[Report Parser] ✗ Could not detect source bureau");
    }

    // Step 2.5: Extract report metadata
    console.log("[Report Parser] Step 2.5: Extracting report metadata...");
    const reportMetadata = extractReportMetadata(text);
    console.log(
      `[Report Parser] ✓ Extracted report metadata with ${reportMetadata.confidence}% confidence`
    );
    if (reportMetadata.reportDate) {
      console.log(`[Report Parser]   - Report Date: ${reportMetadata.reportDate.toISOString().split('T')[0]}`);
    }
    if (reportMetadata.fileNumber) {
      console.log(`[Report Parser]   - File Number: ${reportMetadata.fileNumber}`);
    }
    if (reportMetadata.fraudAlertActive || reportMetadata.securityFreezeActive || reportMetadata.activeDisputePresent) {
      console.log(`[Report Parser]   - Alerts: Fraud=${reportMetadata.fraudAlertActive}, Freeze=${reportMetadata.securityFreezeActive}, Dispute=${reportMetadata.activeDisputePresent}`);
    }

    // Step 3: Extract consumer information
    console.log("[Report Parser] Step 3: Extracting consumer information...");
    const consumerInfo = extractConsumerInfo(text);
    console.log(
      `[Report Parser] ✓ Extracted consumer info with ${consumerInfo.confidence}% confidence`
    );

    // Step 4: Extract credit scores
    console.log("[Report Parser] Step 4: Extracting credit scores...");
    const creditScores = extractCreditScores(text);
    console.log(`[Report Parser] ✓ Found ${creditScores.length} credit score(s)`);

    // Step 5: Extract inquiries
    console.log("[Report Parser] Step 5: Extracting inquiries...");
    const inquiries = extractInquiries(text);
    console.log(`[Report Parser] ✓ Found ${inquiries.length} inquiries`);

    // Step 6: Extract public records
    console.log("[Report Parser] Step 6: Extracting public records...");
    const publicRecords = extractPublicRecords(text);
    console.log(`[Report Parser] ✓ Found ${publicRecords.length} public record(s)`);

    // Step 7: Extract consumer statements
    console.log("[Report Parser] Step 7: Extracting consumer statements...");
    const consumerStatements = extractConsumerStatements(text);
    console.log(`[Report Parser] ✓ Found ${consumerStatements.length} consumer statement(s)`);

    // Step 8: Extract employment information
    console.log("[Report Parser] Step 8: Extracting employment information...");
    const employmentInfo = extractEmploymentInfo(text);
    console.log(`[Report Parser] ✓ Found ${employmentInfo.length} employment record(s)`);

    // Step 9: Parse tradelines from extracted text
    console.log("[Report Parser] Step 9: Extracting tradelines...");
    let rawTradelines: ParsedTradeline[];

    const isEq = isEquifaxFormat(text) || detectedBureau?.bureauName === "Equifax Canada";
    if (isEq) {
      console.log("[Report Parser] Detected Equifax format. Using Equifax PDF extractor.");
      rawTradelines = extractEquifaxTradelines(text);
    } else {
      rawTradelines = extractTradelines(text);
    }

    // Augment tradelines with additional fields extracted from source text.
    // AI augmentation is disabled; async extractor calls are retained only as
    // deterministic compatibility wrappers if a legacy caller enables the flag.
    const tradelines = await Promise.all(
      rawTradelines.map(async (tradeline) => {
        if (!tradeline.sourceText) return tradeline;

        const sourceText = tradeline.sourceText;
        const hasPaymentGrid = hasPaymentHistoryGrid(sourceText);
        const extractedIsCollection = extractIsCollectionAccount(sourceText);
        const extractedCollectionAgencyName =
          extractCollectionAgencyName(sourceText) || undefined;
        const extractedDateAssignedToCollection =
          extractDateAssignedToCollection(sourceText);
        const hasCollectionTurnoverSignal =
          extractCollectionTurnoverSignal(sourceText);
        const accountTypeLooksCollection =
          typeof tradeline.accountType === "string" &&
          tradeline.accountType.toUpperCase().includes("COLLECTION");
        const extractedPaymentPattern =
          extractPaymentPattern(sourceText) ||
          tradeline.paymentPattern ||
          tradeline.paymentHistoryProfile ||
          undefined;
        const normalizedPaymentTerms = normalizeTransUnionPaymentTerms({
          terms: tradeline.terms ?? extractTerms(sourceText) ?? undefined,
          monthlyPayment:
            tradeline.monthlyPayment ?? extractMonthlyPayment(sourceText) ?? undefined,
          scheduledMonthlyPayment: tradeline.scheduledMonthlyPayment,
          paymentFrequency: tradeline.paymentFrequency,
        });
        const resolvedIsCollection =
          tradeline.isCollectionAccount === true ||
          accountTypeLooksCollection ||
          extractedIsCollection;
        const collectionAgencyMissingFromReport =
          tradeline.collectionAgencyMissingFromReport === true ||
          (resolvedIsCollection &&
            hasCollectionTurnoverSignal &&
            !tradeline.collectionAgencyName &&
            !extractedCollectionAgencyName);
        const dateAssignedToCollectionMissingFromReport =
          tradeline.dateAssignedToCollectionMissingFromReport === true ||
          (resolvedIsCollection &&
            hasCollectionTurnoverSignal &&
            !tradeline.dateAssignedToCollection &&
            !extractedDateAssignedToCollection);

        // Base augmentation (synchronous fields)
        const augmented = {
          ...tradeline,
          // Preserve explicit collection fields produced by bureau-specific extractors.
          // Generic extractors are used as fallback enrichment only.
          isCollectionAccount: resolvedIsCollection,
          collectionAgencyName:
            tradeline.collectionAgencyName ||
            extractedCollectionAgencyName,
          originalCreditorName:
            tradeline.originalCreditorName ||
            (collectionAgencyMissingFromReport ? tradeline.creditorName : undefined),
          collectionAgencyMissingFromReport,
          dateAssignedToCollection:
            tradeline.dateAssignedToCollection ??
            extractedDateAssignedToCollection,
          dateAssignedToCollectionMissingFromReport,
          originalBalance: extractOriginalBalance(sourceText) || undefined,
          interestRate: extractInterestRate(sourceText) || undefined,
          terms: normalizedPaymentTerms.terms ?? undefined,
          monthlyPayment: normalizedPaymentTerms.monthlyPayment ?? undefined,
          scheduledMonthlyPayment:
            normalizedPaymentTerms.scheduledMonthlyPayment ?? undefined,
          paymentFrequency: normalizedPaymentTerms.paymentFrequency ?? undefined,
          lastActivityDate: extractLastActivityDate(sourceText),
          responsibilityCode:
            extractResponsibilityCode(sourceText) || undefined,
          ecoaCode: extractEcoaCode(sourceText) || undefined,
          lastPaymentDate: extractLastPaymentDate(sourceText),
          lastPaymentAmount: extractLastPaymentAmount(sourceText) || undefined,
          maturityDate: extractMaturityDate(sourceText),
          postedDate: extractPostedDate(sourceText),
          chargeOffDate: extractChargeOffDate(sourceText),
          balloonPaymentDate: extractBalloonPaymentDate(sourceText),
          paymentPattern: extractedPaymentPattern,
          paymentHistoryProfile:
            tradeline.paymentHistoryProfile || extractedPaymentPattern || null,
        };

        const resolvedEntity = resolveCreditorEntity(tradeline.creditorName);
        console.log(`[Report Parser]   Creditor '${tradeline.creditorName}' resolved to canonical entity: ${resolvedEntity.canonicalName} (${resolvedEntity.entityType})`);

        // Legacy AI augmentation is disabled for authoritative ingestion.
        if (enableAiAugmentation && hasPaymentGrid) {
          console.log(
            `[Report Parser]   Tradeline "${tradeline.creditorName}" has payment grid - using deterministic async compatibility extraction`,
          );

          const deterministicBalance = extractBalance(sourceText);

          const asyncBalance = await extractBalanceAsync(sourceText);
          const shouldUseAsyncBalance =
            asyncBalance > 0 &&
            (
              deterministicBalance <= 0 ||
              tradeline.balance <= 0 ||
              amountsWithinTolerance(asyncBalance, deterministicBalance)
            );

          if (shouldUseAsyncBalance && asyncBalance !== tradeline.balance) {
            console.log(
              `[Report Parser]   Balance updated from ${tradeline.balance} to ${asyncBalance} (deterministic compatibility)`,
            );
            augmented.balance = asyncBalance;
          } else if (deterministicBalance > 0 && deterministicBalance !== tradeline.balance) {
            console.log(
              `[Report Parser]   Balance corrected from ${tradeline.balance} to ${deterministicBalance} (deterministic grid)`,
            );
            augmented.balance = deterministicBalance;
          } else if (asyncBalance > 0 && !shouldUseAsyncBalance) {
            console.log(
              `[Report Parser]   Ignored compatibility balance ${asyncBalance}; keeping deterministic ${deterministicBalance || tradeline.balance}`,
            );
          }

          const asyncAmounts = await extractAmountsAsync(sourceText);
          if (asyncAmounts.high !== undefined || asyncAmounts.pastDue !== undefined) {
            const currentHigh = tradeline.amounts.high;
            const asyncHigh = asyncAmounts.high;
            if (
              asyncHigh !== undefined &&
              (
                currentHigh == null ||
                currentHigh <= 0 ||
                amountsWithinTolerance(asyncHigh, currentHigh)
              ) &&
              asyncHigh !== currentHigh
            ) {
              console.log(
                `[Report Parser]   High credit updated from ${tradeline.amounts.high} to ${asyncHigh} (deterministic compatibility)`,
              );
              augmented.amounts.high = asyncHigh;
            }
            const currentPastDue = tradeline.amounts.pastDue;
            const asyncPastDue = asyncAmounts.pastDue;
            if (
              asyncPastDue !== undefined &&
              (
                currentPastDue == null ||
                amountsWithinTolerance(asyncPastDue, currentPastDue, 0.5)
              ) &&
              asyncPastDue !== currentPastDue
            ) {
              console.log(
                `[Report Parser]   Past due updated from ${tradeline.amounts.pastDue} to ${asyncPastDue} (deterministic compatibility)`,
              );
              augmented.amounts.pastDue = asyncPastDue;
            }
          }

          const asyncCreditLimit = await extractCreditLimitAsync(sourceText);
          if (
            asyncCreditLimit &&
            (
              !tradeline.creditLimit ||
              tradeline.creditLimit <= 0 ||
              amountsWithinTolerance(asyncCreditLimit, tradeline.creditLimit)
            )
          ) {
            augmented.creditLimit = asyncCreditLimit;
          }

          const asyncMop = await extractMopAsync(sourceText);
          if (asyncMop !== undefined) {
            augmented.mop = asyncMop;
          }
        } else {
          // No payment grid - use synchronous extractor for credit limit
          augmented.creditLimit =
            extractCreditLimit(sourceText) ?? tradeline.creditLimit ?? undefined;
        }

        return augmented;
      }),
    );
    console.log(
      `[Report Parser] ✓ Successfully parsed ${tradelines.length} tradelines`,
    );

    // Step 10: Extract payment history for each tradeline
    console.log("[Report Parser] Step 10: Extracting payment histories...");
    const paymentHistories: ExtractedPaymentHistory[] = [];
    
    for (let i = 0; i < tradelines.length; i++) {
      const tradeline = tradelines[i];
      // Use the sourceText if available, otherwise fall back to full text (less accurate)
      const tradelineText = tradeline.sourceText || text;
      const paymentHistory = extractPaymentHistory(tradelineText);
      const sourcePaymentPattern =
        tradeline.paymentHistoryProfile ||
        tradeline.paymentPattern ||
        paymentHistory.paymentPattern;

      if (sourcePaymentPattern) {
        paymentHistory.paymentPattern = sourcePaymentPattern;
      }

      if (tradeline.paymentHistory) {
        paymentHistory.times30DaysLate =
          paymentHistory.times30DaysLate ?? tradeline.paymentHistory["30"] ?? null;
        paymentHistory.times60DaysLate =
          paymentHistory.times60DaysLate ?? tradeline.paymentHistory["60"] ?? null;
        paymentHistory.times90DaysLate =
          paymentHistory.times90DaysLate ?? tradeline.paymentHistory["90"] ?? null;
        (paymentHistory as any).paymentHistorySummary = tradeline.paymentHistory;
      }

      if (tradeline.monthsReviewed != null) {
        (paymentHistory as any).monthsReviewed = tradeline.monthsReviewed;
      }

      if (tradeline.scheduledMonthlyPayment != null && paymentHistory.monthlyPayment == null) {
        paymentHistory.monthlyPayment = tradeline.scheduledMonthlyPayment;
      }

      if (tradeline.paymentFrequency) {
        (paymentHistory as any).termsFrequency = tradeline.paymentFrequency;
      }

      if (tradeline.paymentHistoryDetails?.length) {
        (paymentHistory as any).paymentHistoryDetails = tradeline.paymentHistoryDetails;
      }

      paymentHistories.push(paymentHistory);
      
      console.log(
        `[Report Parser]   Tradeline ${i + 1} (${tradeline.creditorName}): Payment history extracted with ${paymentHistory.confidence}% confidence`
      );
    }

    console.log(`[Report Parser] ✓ Extracted ${paymentHistories.length} payment histories`);

    // Final summary
    console.log(
      `[Report Parser] ═══════════════════════════════════════════════════`
    );
    console.log(
      `[Report Parser] PARSE COMPLETE - Summary:`
    );
    console.log(
      `[Report Parser]   - Bureau: ${detectedBureau?.bureauName || "Unknown"}`
    );
    console.log(
      `[Report Parser]   - Report Date: ${reportMetadata.reportDate?.toISOString().split('T')[0] || "N/A"}`
    );
    console.log(
      `[Report Parser]   - File Number: ${reportMetadata.fileNumber || "N/A"}`
    );
    if (reportMetadata.fraudAlertActive || reportMetadata.securityFreezeActive || reportMetadata.activeDisputePresent) {
      console.log(
        `[Report Parser]   - Active Alerts: ${[
          reportMetadata.fraudAlertActive && "Fraud Alert",
          reportMetadata.securityFreezeActive && "Security Freeze",
          reportMetadata.activeDisputePresent && "Active Dispute"
        ].filter(Boolean).join(", ")}`
      );
    }
    console.log(
      `[Report Parser]   - Consumer Info: ${consumerInfo.fullName || "N/A"}`
    );
    console.log(
      `[Report Parser]   - Credit Scores: ${creditScores.length}`
    );
    console.log(
      `[Report Parser]   - Tradelines: ${tradelines.length}`
    );
    console.log(
      `[Report Parser]   - Payment Histories: ${paymentHistories.length}`
    );
    console.log(
      `[Report Parser]   - Inquiries: ${inquiries.length}`
    );
    console.log(
      `[Report Parser]   - Public Records: ${publicRecords.length}`
    );
    console.log(
      `[Report Parser]   - Consumer Statements: ${consumerStatements.length}`
    );
    console.log(
      `[Report Parser]   - Employment Records: ${employmentInfo.length}`
    );
    console.log(
      `[Report Parser] ═══════════════════════════════════════════════════`
    );

    return {
      tradelines,
      sourceBureau: detectedBureau ? {
        bureauName: detectedBureau.bureauName,
        confidence: detectedBureau.confidence
      } : null,
      consumerInfo,
      rawText: text,
      reportMetadata,
      creditScores,
      inquiries,
      publicRecords,
      consumerStatements,
      employmentInfo,
      paymentHistories,
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `[Report Parser] Failed to parse report:`,
        error.message,
      );
    } else {
      console.error(`[Report Parser] Failed to parse report:`, error);
    }
    const emptyMetadata: ExtractedReportMetadata = {
      reportDate: null,
      reportNumber: null,
      fileNumber: null,
      bureauFileId: null,
      transUnionCaseId: null,
      bureauName: null,
      bureauPhone: null,
      bureauAddress: null,
      totalAccounts: null,
      openAccounts: null,
      closedAccounts: null,
      delinquentAccounts: null,
      derogatoryAccounts: null,
      totalBalances: null,
      totalCreditLimit: null,
      utilizationPercent: null,
      fraudAlertActive: false,
      securityFreezeActive: false,
      activeDisputePresent: false,
      militaryLendingActCovered: false,
      oldestAccountDate: null,
      newestAccountDate: null,
      averageAccountAge: null,
      rawHeaderText: null,
      confidence: 0,
    };
    
    return {
      tradelines: [],
      sourceBureau: null,
      consumerInfo: null,
      rawText: "",
      reportMetadata: emptyMetadata,
      creditScores: [],
      inquiries: [],
      publicRecords: [],
      consumerStatements: [],
      employmentInfo: [],
      paymentHistories: [],
    };
  }
}
