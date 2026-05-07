import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveDeterministicDraftExtractions } from "../../helpers/deterministicDraftExtraction";
import type { ComprehensiveParseResult } from "../../helpers/reportParserTypes";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function parseResult(): ComprehensiveParseResult {
  return {
    rawText: "TransUnion Canada\nDate of Birth Jan 30, 1961\nBANK OF NOVA SCOTIA account 1234 balance 0",
    sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
    consumerInfo: {
      fullName: "TEST CONSUMER",
      addressLine1: "123 MAIN ST",
      addressLine2: null,
      city: "HALIFAX",
      province: "NS",
      postalCode: "B3J 1A1",
      dateOfBirth: new Date(Date.UTC(1961, 0, 30)),
      dateOfBirthRaw: "Jan 30, 1961",
      phone: null,
      phoneSecondary: null,
      sinLastDigits: null,
      previousAddresses: [],
      confidence: 100,
    },
    reportMetadata: {
      reportDate: new Date(Date.UTC(2026, 0, 10)),
      reportNumber: null,
      fileNumber: null,
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
      rawHeaderText: "TransUnion Canada",
      confidence: 100,
    },
    tradelines: [
      {
        creditorName: "BANK OF NOVA SCOTIA",
        accountNumber: "1234",
        accountType: "Installment",
        balance: 0,
        status: "Open",
        dates: { opened: new Date(Date.UTC(2020, 0, 1)), reported: new Date(Date.UTC(2026, 0, 10)) },
        amounts: { high: 1000, pastDue: 0 },
        remarkCodes: ["AC"],
        sourceText: "BANK OF NOVA SCOTIA account 1234 balance 0",
      },
    ],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
  };
}

describe("deterministic ingestion lockdown", () => {
  it("routes credit-ingestion-adjacent extraction endpoints through canonical extraction", () => {
    const ocrExtract = source("endpoints/ocr/extract_POST.ts");
    const sourceTextBackfill = source("endpoints/tradeline/backfill-source-text_POST.ts");

    expect(ocrExtract).toContain("extractCanonicalCreditReport");
    expect(sourceTextBackfill).toContain("extractCanonicalCreditReport");
    expect(ocrExtract).not.toMatch(/import\s+\{\s*parseReport\s*\}/);
    expect(sourceTextBackfill).not.toMatch(/import\s+\{\s*parseReport\s*\}/);
    expect(ocrExtract).not.toMatch(/parseReport\(/);
    expect(sourceTextBackfill).not.toMatch(/parseReport\(/);
  });

  it("keeps authoritative ingest draft persistence off the legacy DocStrange-shaped mapper", () => {
    const ingestCore = source("helpers/ingestCorePipeline.tsx");

    expect(ingestCore).toContain("deriveDeterministicDraftExtractions");
    expect(ingestCore).toContain("replayValidation");
    expect(ingestCore).not.toContain("unifiedExtract(");
    expect(ingestCore).not.toContain("mapDocStrangeResponseToResult");
  });

  it("requires parser-test creation to persist canonical replay metadata", () => {
    const createEndpoint = source("endpoints/parser-test-case/create_POST.ts");

    expect(createEndpoint).toContain("hasCanonicalContext");
    expect(createEndpoint).toContain("!hasCanonicalContext");
    expect(createEndpoint).toContain("canonicalOutput");
    expect(createEndpoint).toContain("replayHash");
    expect(createEndpoint).toContain("replayValidation");
  });

  it("keeps Stage Lab saves visible in Violation Corrections by materializing ingestion", () => {
    const stageTab = source("components/ParserLabStageTab.tsx");
    const createSchema = source("endpoints/parser-test-case/create_POST.schema.ts");
    const createEndpoint = source("endpoints/parser-test-case/create_POST.ts");

    expect(stageTab).toContain("materializeForViolationCorrections: true");
    expect(createSchema).toContain("materializeForViolationCorrections: z.boolean().optional()");
    expect(createEndpoint).toContain("materializeStageLabForViolationCorrections");
    expect(createEndpoint).toContain("handleIngestProcess");
    expect(createEndpoint).toContain('source: "stage_lab_test_case"');
  });

  it("derives Pass A and Full extraction records with deterministic pdf text provenance", () => {
    const result = deriveDeterministicDraftExtractions(parseResult(), 42);

    expect(result.passA.raw_evidence.length).toBeGreaterThan(0);
    expect(result.passA.raw_evidence.every((item) => item.evidence.source_method === "pdf_text")).toBe(true);
    expect(result.passA.consumer_profile.date_of_birth?.evidence.source_method).toBe("pdf_text");
    expect(result.passA.bureau_context.tu_case_id?.value).toBe("L121322");
    expect(result.fullExtraction.bureau_context.tu_case_id?.value).toBe("L121322");
    expect(result.fullExtraction.accounts[0].creditor_name.value).toBe("BANK OF NOVA SCOTIA");
    expect(result.fullExtraction.accounts[0].creditor_name.evidence.source_method).toBe("pdf_text");
  });
});
