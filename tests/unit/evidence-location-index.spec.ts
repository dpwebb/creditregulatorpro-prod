import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildDeterministicCreditReportPipelinePackage,
  type CanonicalTextSourceMethod,
} from "../../helpers/deterministicCreditReportPipeline";
import { buildEvidenceLocationIndex } from "../../helpers/evidenceLocationIndex";
import type { DeterministicOcrProvenance } from "../../helpers/deterministicOcr";
import type { ComprehensiveParseResult, ParsedTradeline } from "../../helpers/reportParserTypes";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function tradeline(overrides: Partial<ParsedTradeline> = {}): ParsedTradeline {
  return {
    creditorName: "SECOND PAGE BANK VISA",
    accountNumber: "********1111",
    accountType: "REVOLVING / INDIVIDUAL",
    balance: 2345.67,
    status: "Open",
    dates: {
      opened: new Date(Date.UTC(2020, 0, 15)),
      reported: new Date(Date.UTC(2026, 0, 10)),
      closed: null,
      dofd: null,
    },
    amounts: {
      high: 5000,
      pastDue: 0,
    },
    remarkCodes: ["AC"],
    sourceText:
      "Creditor Name SECOND PAGE BANK VISA Account Number ********1111 Balance $2,345.67 Reported Date 2026-01-10",
    ...overrides,
  };
}

function parseResult(rawText: string, overrides: Partial<ComprehensiveParseResult> = {}): ComprehensiveParseResult {
  return {
    rawText,
    sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
    reportMetadata: {
      reportDate: new Date(Date.UTC(2026, 0, 10)),
      reportNumber: null,
      fileNumber: "TU-123",
      bureauFileId: null,
      transUnionCaseId: "L121322",
      bureauName: "TransUnion Canada",
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
      rawHeaderText: "TransUnion Canada Credit Report Report Date 2026-01-10",
      confidence: 100,
    },
    consumerInfo: {
      fullName: "TEST CONSUMER",
      addressLine1: "26 MAIN ST E",
      addressLine2: null,
      city: "STEWIACKE",
      province: "NS",
      postalCode: "B0N 2J0",
      dateOfBirth: new Date(Date.UTC(1977, 3, 11)),
      dateOfBirthRaw: "Apr 11, 1977",
      phone: null,
      phoneSecondary: null,
      sinLastDigits: null,
      previousAddresses: [],
      confidence: 100,
    },
    tradelines: [tradeline()],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
    ...overrides,
  };
}

function build(
  rawText: string,
  overrides: Partial<ComprehensiveParseResult> = {},
  options: {
    sourceMethod?: CanonicalTextSourceMethod;
    ocrProvenance?: DeterministicOcrProvenance | null;
  } = {},
) {
  return buildDeterministicCreditReportPipelinePackage({
    parseResult: parseResult(rawText, overrides),
    rawText,
    documentBinarySha256: "document-sha",
    sourceMethod: options.sourceMethod,
    ocrProvenance: options.ocrProvenance,
  });
}

describe("evidence location index sidecar", () => {
  it("builds a sidecar keyed by stable canonical evidence IDs", () => {
    const rawText = [
      "TransUnion Canada Credit Report",
      "Report Date 2026-01-10",
      "Personal Information",
      "Date of Birth Apr 11, 1977",
      "\f",
      "Account Information",
      "Creditor Name SECOND PAGE BANK VISA",
      "Account Number ********1111",
      "Balance $2,345.67",
      "Reported Date 2026-01-10",
    ].join("\n");
    const pipeline = build(rawText, {
      tradelines: [
        tradeline({
          sourceText:
            "Creditor Name SECOND PAGE BANK VISA Account Number ********1111 Balance $2,345.67 Reported Date 2026-01-10",
        }),
      ],
    });

    const canonicalBefore = JSON.stringify(pipeline.finalOutput);
    const replayHashBefore = pipeline.replayHash;
    const index = buildEvidenceLocationIndex(pipeline);
    const creditorEvidence = pipeline.finalOutput.fields["tradelines[0].creditorName"].evidence;
    const creditorEntry = index[creditorEvidence.evidenceId!];

    expect(Object.keys(index).length).toBeGreaterThan(0);
    expect(creditorEntry).toEqual(
      expect.objectContaining({
        evidenceId: creditorEvidence.evidenceId,
        fieldKey: "tradelines[0].creditorName",
        sourceMethod: "pdf_text",
        extractionMethod: "native_pdf_text",
        pageNumber: 2,
        sectionName: "tradeline_accounts",
        zoneName: "tradeline_accounts",
        confidence: 1,
      }),
    );
    expect(creditorEntry.sourceField).toContain("pdf_text.parseResult.tradelines[0].creditorName");
    expect(creditorEntry.textSnippet).toContain("SECOND PAGE BANK VISA");
    expect(creditorEntry.tokenIndexes?.length).toBeGreaterThan(0);
    expect(creditorEntry.provenance).toEqual(
      expect.objectContaining({
        deterministicPipelineVersion: pipeline.version,
        documentBinarySha256: pipeline.documentBinarySha256,
        rawTextSha256: pipeline.rawTextSha256,
        canonicalResultSha256: pipeline.canonicalResultSha256,
        replayHash: pipeline.replayHash,
      }),
    );
    expect(creditorEntry).not.toHaveProperty("boundingBox");
    expect(JSON.stringify(pipeline.finalOutput)).toBe(canonicalBefore);
    expect(pipeline.replayHash).toBe(replayHashBefore);

    const second = build(rawText, {
      tradelines: [
        tradeline({
          sourceText:
            "Creditor Name SECOND PAGE BANK VISA Account Number ********1111 Balance $2,345.67 Reported Date 2026-01-10",
        }),
      ],
    });
    expect(Object.keys(buildEvidenceLocationIndex(second))).toEqual(Object.keys(index));
    expect(second.finalOutput.fields["tradelines[0].creditorName"].evidence.evidenceId).toBe(
      creditorEvidence.evidenceId,
    );
  });

  it("omits pageNumber when native PDF text has no explicit page boundary", () => {
    const rawText = [
      "TransUnion Canada Credit Report",
      "Report Date 2026-01-10",
      "Personal Information",
      "Date of Birth Apr 11, 1977",
      "Account Information",
      "Creditor Name SECOND PAGE BANK VISA",
    ].join("\n");
    const pipeline = build(rawText);
    const dobEvidence = pipeline.finalOutput.fields["consumerInfo.dateOfBirth"].evidence;
    const index = buildEvidenceLocationIndex(pipeline);
    const dobEntry = index[dobEvidence.evidenceId!];

    expect(dobEvidence.pageNumber).toBe(1);
    expect(dobEntry).not.toHaveProperty("pageNumber");
    expect(dobEntry).not.toHaveProperty("boundingBox");
  });

  it("keeps OCR page evidence when deterministic OCR provenance is present", () => {
    const rawText = [
      "TransUnion Canada Credit Report",
      "Report Date 2026-01-10",
      "Personal Information",
      "Date of Birth Apr 11, 1977",
    ].join("\n");
    const pipeline = build(rawText, {}, {
      sourceMethod: "ocr_text",
      ocrProvenance: {
        sourceMethod: "ocr_text",
        engine: "tesseract-cli",
        renderer: "pdftoppm",
        engineVersion: "tesseract 5.3.0",
        rendererVersion: "pdftoppm 23.11.0",
        pageCount: 1,
        overallConfidence: 0.94,
        pages: [
          {
            pageNumber: 1,
            sourceMethod: "ocr_text",
            engine: "tesseract-cli",
            renderer: "pdftoppm",
            confidence: 0.94,
            charCount: rawText.length,
            wordCount: rawText.split(/\s+/).length,
            textSnippet: "TransUnion Canada Credit Report",
          },
        ],
        quality: {
          isValid: true,
          printableRatio: 0.99,
          keywordCount: 6,
          avgWordLength: 5,
          totalChars: rawText.length,
        },
        validation: {
          deterministic: true,
          qualityAccepted: true,
          minimumRules: ["OCR text passed deterministic credit-report text quality checks"],
        },
      },
    });
    const dobEvidence = pipeline.finalOutput.fields["consumerInfo.dateOfBirth"].evidence;
    const entry = buildEvidenceLocationIndex(pipeline)[dobEvidence.evidenceId!];

    expect(entry).toEqual(
      expect.objectContaining({
        sourceMethod: "ocr_text",
        extractionMethod: "ocr_text",
        pageNumber: 1,
      }),
    );
    expect(entry.provenance).toEqual(
      expect.objectContaining({
        ocrEngine: "tesseract-cli",
        ocrRenderer: "pdftoppm",
        ocrOverallConfidence: 0.94,
        ocrPageConfidence: 0.94,
      }),
    );
    expect(entry).not.toHaveProperty("boundingBox");
  });

  it("stores the sidecar under reportArtifact.data during ingestion", () => {
    const ingestCore = source("helpers/ingestCorePipeline.tsx");

    expect(ingestCore).toContain("buildEvidenceLocationIndex(deterministicPipeline)");
    expect(ingestCore).toContain("evidenceLocationIndex");
  });
});
