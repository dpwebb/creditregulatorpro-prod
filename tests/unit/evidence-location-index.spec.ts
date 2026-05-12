import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildDeterministicCreditReportPipelinePackage,
  type CanonicalTextSourceMethod,
} from "../../helpers/deterministicCreditReportPipeline";
import { buildEvidenceLocationIndex, resolveEvidenceLocation } from "../../helpers/evidenceLocationIndex";
import {
  OCR_COORDINATE_EXTRACTOR_VERSION,
  type DeterministicOcrCoordinateIndex,
  type DeterministicOcrProvenance,
  type TesseractTsvWordBox,
} from "../../helpers/deterministicOcr";
import {
  PDFJS_COORDINATE_EXTRACTOR_VERSION,
  type PdfjsCoordinateIndex,
  type PdfjsTextItemCoordinate,
} from "../../helpers/pdfjsEvidenceCoordinates";
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

function boxWord(text: string, wordIndex: number, left: number, pageNumber = 1): TesseractTsvWordBox {
  return {
    wordIndex,
    pageNumber,
    blockNumber: 1,
    paragraphNumber: 1,
    lineNumber: 1,
    wordNumber: wordIndex + 1,
    left,
    top: 20,
    width: 20,
    height: 10,
    confidence: 0.94,
    text,
  };
}

function ocrCoordinateIndex(words: TesseractTsvWordBox[], pageNumber = 1): DeterministicOcrCoordinateIndex {
  return {
    sourceMethod: "ocr_text",
    coordinateSource: "tesseract_tsv_word",
    coordinateExtractorVersion: OCR_COORDINATE_EXTRACTOR_VERSION,
    pages: [
      {
        pageNumber,
        pageDimensions: { width: 800, height: 1000, unit: "px" },
        words,
      },
    ],
  };
}

function pdfItem(
  text: string,
  itemIndex: number,
  x: number,
  pageNumber = 2,
  width = 40,
): PdfjsTextItemCoordinate {
  return {
    pageNumber,
    itemIndex,
    text,
    x,
    y: 20,
    width,
    height: 12,
    unit: "pt",
    pageWidth: 612,
    pageHeight: 792,
    source: "pdfjs_text_item",
  };
}

function pdfCoordinateIndex(items: PdfjsTextItemCoordinate[], pageNumber = 2): PdfjsCoordinateIndex {
  return {
    sourceMethod: "pdf_text",
    coordinateSource: "pdfjs_text_item",
    coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
    pages: [
      {
        pageNumber,
        pageDimensions: { width: 612, height: 792, unit: "pt" },
        items,
      },
    ],
  };
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

  it("stores optional boundingBox only for OCR-derived evidence entries with one safe TSV span", () => {
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
    const evidenceIdBefore = dobEvidence.evidenceId;
    const canonicalBefore = JSON.stringify(pipeline.finalOutput);
    const replayHashBefore = pipeline.replayHash;
    const index = buildEvidenceLocationIndex(pipeline, {
      ocrCoordinateIndex: ocrCoordinateIndex([
        boxWord("Date", 0, 10),
        boxWord("of", 1, 35),
        boxWord("Birth", 2, 50),
        boxWord("Apr", 3, 85),
        boxWord("11,", 4, 110),
        boxWord("1977", 5, 130),
      ]),
    });
    const entry = index[dobEvidence.evidenceId!];

    expect(entry).toMatchObject({
      evidenceId: evidenceIdBefore,
      sourceMethod: "ocr_text",
      extractionMethod: "ocr_text",
      pageNumber: 1,
      boundingBox: {
        x: 10,
        y: 20,
        width: 140,
        height: 10,
        unit: "px",
        pageNumber: 1,
        coordinateSource: "tesseract_tsv_word",
        coordinateValidated: true,
      },
      coordinateConfidence: 0.94,
      wordSpanIndexes: [0, 1, 2, 3, 4, 5],
      coordinateExtractorVersion: OCR_COORDINATE_EXTRACTOR_VERSION,
      pageDimensions: { width: 800, height: 1000, unit: "px" },
    });
    expect(entry.matchedTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.canonicalValueHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.sourceTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(pipeline.finalOutput)).toBe(canonicalBefore);
    expect(pipeline.replayHash).toBe(replayHashBefore);
    expect(pipeline.finalOutput.fields["consumerInfo.dateOfBirth"].evidence.evidenceId).toBe(evidenceIdBefore);
  });

  it("does not create boundingBox for non-OCR sidecar entries", () => {
    const rawText = [
      "TransUnion Canada Credit Report",
      "Report Date 2026-01-10",
      "Personal Information",
      "Date of Birth Apr 11, 1977",
      "\f",
      "Account Information",
      "Creditor Name SECOND PAGE BANK VISA",
    ].join("\n");
    const pipeline = build(rawText);
    const dobEvidence = pipeline.finalOutput.fields["consumerInfo.dateOfBirth"].evidence;
    const index = buildEvidenceLocationIndex(pipeline, {
      ocrCoordinateIndex: ocrCoordinateIndex([
        boxWord("Date", 0, 10),
        boxWord("of", 1, 35),
        boxWord("Birth", 2, 50),
        boxWord("Apr", 3, 85),
        boxWord("11,", 4, 110),
        boxWord("1977", 5, 130),
      ]),
    });

    expect(index[dobEvidence.evidenceId!]).not.toHaveProperty("boundingBox");
  });

  it("stores optional boundingBox only for native PDF entries with one safe pdfjs span", () => {
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
    const creditorEvidence = pipeline.finalOutput.fields["tradelines[0].creditorName"].evidence;
    const evidenceIdBefore = creditorEvidence.evidenceId;
    const canonicalBefore = JSON.stringify(pipeline.finalOutput);
    const replayHashBefore = pipeline.replayHash;
    const index = buildEvidenceLocationIndex(pipeline, {
      nativePdfCoordinateIndex: pdfCoordinateIndex([
        pdfItem("SECOND", 0, 10, 2, 45),
        pdfItem("PAGE", 1, 60, 2, 35),
        pdfItem("BANK", 2, 100, 2, 35),
        pdfItem("VISA", 3, 140, 2, 32),
      ]),
    });
    const entry = index[creditorEvidence.evidenceId!];

    expect(entry).toMatchObject({
      evidenceId: evidenceIdBefore,
      sourceMethod: "pdf_text",
      extractionMethod: "native_pdf_text",
      pageNumber: 2,
      boundingBox: {
        x: 10,
        y: 20,
        width: 162,
        height: 12,
        unit: "pt",
        pageNumber: 2,
        coordinateSource: "pdfjs_text_item",
        coordinateValidated: true,
      },
      itemSpanIndexes: [0, 1, 2, 3],
      coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
      pageDimensions: { width: 612, height: 792, unit: "pt" },
    });
    expect(entry).not.toHaveProperty("wordSpanIndexes");
    expect(entry.matchedTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.canonicalValueHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.sourceTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(pipeline.finalOutput)).toBe(canonicalBefore);
    expect(pipeline.replayHash).toBe(replayHashBefore);
    expect(pipeline.finalOutput.fields["tradelines[0].creditorName"].evidence.evidenceId).toBe(evidenceIdBefore);
  });

  it("does not default native PDF coordinate matches with missing reliable pages to page 1", () => {
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
    const index = buildEvidenceLocationIndex(pipeline, {
      nativePdfCoordinateIndex: pdfCoordinateIndex([
        pdfItem("Date", 0, 10, 2, 30),
        pdfItem("of", 1, 45, 2, 15),
        pdfItem("Birth", 2, 65, 2, 35),
        pdfItem("Apr", 3, 105, 2, 25),
        pdfItem("11,", 4, 135, 2, 20),
        pdfItem("1977", 5, 160, 2, 30),
      ]),
    });
    const entry = index[dobEvidence.evidenceId!];

    expect(entry).not.toHaveProperty("pageNumber");
    expect(entry.boundingBox).toMatchObject({
      pageNumber: 2,
      coordinateSource: "pdfjs_text_item",
      unit: "pt",
    });
  });

  it("does not alter OCR boundingBox entries when a native PDF sidecar is also supplied", () => {
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
    const index = buildEvidenceLocationIndex(pipeline, {
      ocrCoordinateIndex: ocrCoordinateIndex([
        boxWord("Date", 0, 10),
        boxWord("of", 1, 35),
        boxWord("Birth", 2, 50),
        boxWord("Apr", 3, 85),
        boxWord("11,", 4, 110),
        boxWord("1977", 5, 130),
      ]),
      nativePdfCoordinateIndex: pdfCoordinateIndex([
        pdfItem("Date", 0, 10, 1),
        pdfItem("of", 1, 35, 1),
        pdfItem("Birth", 2, 50, 1),
      ], 1),
    });

    expect(index[dobEvidence.evidenceId!]).toMatchObject({
      sourceMethod: "ocr_text",
      extractionMethod: "ocr_text",
      boundingBox: {
        unit: "px",
        coordinateSource: "tesseract_tsv_word",
        coordinateValidated: true,
      },
      wordSpanIndexes: [0, 1, 2, 3, 4, 5],
    });
    expect(index[dobEvidence.evidenceId!]).not.toHaveProperty("itemSpanIndexes");
  });

  it("stores the sidecar under reportArtifact.data during ingestion", () => {
    const ingestCore = source("helpers/ingestCorePipeline.tsx");

    expect(ingestCore).toContain("buildEvidenceLocationIndex(deterministicPipeline");
    expect(ingestCore).toContain("evidenceLocationIndex");
  });

  it("resolves deterministic locations by evidenceId before field fallback", () => {
    const reportArtifactData = {
      evidenceLocationIndex: {
        "evidence-balance": {
          evidenceId: "evidence-balance",
          fieldKey: "tradelines[0].balance",
          sourceField: "pdf_text.parseResult.tradelines[0].balance",
          sourceMethod: "pdf_text",
          extractionMethod: "native_pdf_text",
          pageNumber: 2,
          textSnippet: "Balance $2,345.67 Reported Date 2026-01-10",
          tokenIndexes: [4, 5, 6],
          provenance: {
            deterministicPipelineVersion: "test-v1",
            documentBinarySha256: "document-sha",
            rawTextSha256: "raw-sha",
            canonicalResultSha256: "canonical-sha",
            replayHash: "replay-sha",
          },
        },
      },
    };

    const resolved = resolveEvidenceLocation({ reportArtifactData }, {
      evidenceId: "evidence-balance",
      fieldName: "balance",
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        evidenceId: "evidence-balance",
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
      }),
    );
    expect(resolved).not.toHaveProperty("boundingBox");
  });

  it("omits locations when the sidecar is missing or field fallback is ambiguous", () => {
    const ambiguousReportArtifactData = {
      evidenceLocationIndex: {
        "evidence-balance-0": {
          evidenceId: "evidence-balance-0",
          fieldKey: "tradelines[0].balance",
          provenance: {
            deterministicPipelineVersion: "test-v1",
            documentBinarySha256: "document-sha",
            rawTextSha256: "raw-sha",
            canonicalResultSha256: "canonical-sha",
            replayHash: "replay-sha",
          },
        },
        "evidence-balance-1": {
          evidenceId: "evidence-balance-1",
          fieldKey: "tradelines[1].balance",
          provenance: {
            deterministicPipelineVersion: "test-v1",
            documentBinarySha256: "document-sha",
            rawTextSha256: "raw-sha",
            canonicalResultSha256: "canonical-sha",
            replayHash: "replay-sha",
          },
        },
      },
    };

    expect(resolveEvidenceLocation({ reportArtifactData: null }, { fieldName: "balance" })).toBeNull();
    expect(resolveEvidenceLocation({ reportArtifactData: ambiguousReportArtifactData }, { fieldName: "balance" })).toBeNull();
  });

  it("does not invent page numbers when a matched sidecar entry has none", () => {
    const reportArtifactData = {
      evidenceLocationIndex: {
        "evidence-balance": {
          evidenceId: "evidence-balance",
          fieldKey: "tradelines[0].balance",
          provenance: {
            deterministicPipelineVersion: "test-v1",
            documentBinarySha256: "document-sha",
            rawTextSha256: "raw-sha",
            canonicalResultSha256: "canonical-sha",
            replayHash: "replay-sha",
          },
        },
      },
    };

    const resolved = resolveEvidenceLocation({ reportArtifactData }, { fieldName: "balance" });

    expect(resolved).not.toHaveProperty("pageNumber");
    expect(resolved).not.toHaveProperty("boundingBox");
  });

  it("resolves stored OCR boundingBox metadata without raw OCR text expansion", () => {
    const reportArtifactData = {
      evidenceLocationIndex: {
        "evidence-dob": {
          evidenceId: "evidence-dob",
          fieldKey: "consumerInfo.dateOfBirth",
          sourceMethod: "ocr_text",
          extractionMethod: "ocr_text",
          pageNumber: 1,
          textSnippet: "Date of Birth Apr 11, 1977",
          boundingBox: {
            x: 10,
            y: 20,
            width: 140,
            height: 10,
            unit: "px",
            pageNumber: 1,
            coordinateSource: "tesseract_tsv_word",
            coordinateValidated: true,
          },
          coordinateConfidence: 0.94,
          wordSpanIndexes: [0, 1, 2, 3, 4, 5],
          matchedTextHash: "a".repeat(64),
          canonicalValueHash: "b".repeat(64),
          sourceTextHash: "c".repeat(64),
          coordinateExtractorVersion: OCR_COORDINATE_EXTRACTOR_VERSION,
          pageDimensions: { width: 800, height: 1000, unit: "px" },
          provenance: {
            deterministicPipelineVersion: "test-v1",
            documentBinarySha256: "document-sha",
            rawTextSha256: "raw-sha",
            canonicalResultSha256: "canonical-sha",
            replayHash: "replay-sha",
          },
        },
      },
    };

    const resolved = resolveEvidenceLocation({ reportArtifactData }, { evidenceId: "evidence-dob" });

    expect(resolved).toMatchObject({
      evidenceId: "evidence-dob",
      extractionMethod: "ocr_text",
      boundingBox: {
        x: 10,
        y: 20,
        width: 140,
        height: 10,
        unit: "px",
        pageNumber: 1,
        coordinateSource: "tesseract_tsv_word",
        coordinateValidated: true,
      },
      coordinateConfidence: 0.94,
      wordSpanIndexes: [0, 1, 2, 3, 4, 5],
      coordinateExtractorVersion: OCR_COORDINATE_EXTRACTOR_VERSION,
      pageDimensions: { width: 800, height: 1000, unit: "px" },
    });
    expect(resolved?.matchedTextHash).toBe("a".repeat(64));
    expect(resolved?.canonicalValueHash).toBe("b".repeat(64));
    expect(resolved?.sourceTextHash).toBe("c".repeat(64));
  });

  it("resolves stored native PDF boundingBox metadata without raw PDF text expansion", () => {
    const reportArtifactData = {
      evidenceLocationIndex: {
        "evidence-status": {
          evidenceId: "evidence-status",
          fieldKey: "tradelines[0].status",
          sourceMethod: "pdf_text",
          extractionMethod: "native_pdf_text",
          textSnippet: "STATUS OPEN",
          boundingBox: {
            x: 10,
            y: 20,
            width: 90,
            height: 12,
            unit: "pt",
            pageNumber: 2,
            coordinateSource: "pdfjs_text_item",
            coordinateValidated: true,
          },
          itemSpanIndexes: [4, 5],
          matchedTextHash: "d".repeat(64),
          canonicalValueHash: "e".repeat(64),
          sourceTextHash: "f".repeat(64),
          coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
          pageDimensions: { width: 612, height: 792, unit: "pt" },
          provenance: {
            deterministicPipelineVersion: "test-v1",
            documentBinarySha256: "document-sha",
            rawTextSha256: "raw-sha",
            canonicalResultSha256: "canonical-sha",
            replayHash: "replay-sha",
          },
        },
      },
    };

    const resolved = resolveEvidenceLocation({ reportArtifactData }, { evidenceId: "evidence-status" });

    expect(resolved).toMatchObject({
      evidenceId: "evidence-status",
      extractionMethod: "native_pdf_text",
      boundingBox: {
        x: 10,
        y: 20,
        width: 90,
        height: 12,
        unit: "pt",
        pageNumber: 2,
        coordinateSource: "pdfjs_text_item",
        coordinateValidated: true,
      },
      itemSpanIndexes: [4, 5],
      coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
      pageDimensions: { width: 612, height: 792, unit: "pt" },
    });
    expect(resolved).not.toHaveProperty("wordSpanIndexes");
    expect(resolved?.matchedTextHash).toBe("d".repeat(64));
    expect(resolved?.canonicalValueHash).toBe("e".repeat(64));
    expect(resolved?.sourceTextHash).toBe("f".repeat(64));
  });
});
