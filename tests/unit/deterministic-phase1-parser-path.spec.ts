import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentText: "",
  extractTextFromPdfWithQuality: vi.fn(),
}));

vi.mock("../../helpers/pdfTextExtractor", () => ({
  extractTextFromPdfWithQuality: mocks.extractTextFromPdfWithQuality,
}));

import { parsePdfThroughProductionHtmlPipeline } from "../../helpers/parserTestProductionParser";
import {
  equifaxCollapsedCollectionsTextFixture,
  equifaxMortgageTextFixture,
  transUnionPortalTwoAccountTextOrderFixture,
  transUnionRegionalDisclosureTextFixture,
} from "../fixtures/creditReportFixtures";

const validTextQuality = {
  isValid: true,
  printableRatio: 0.99,
  keywordCount: 12,
  avgWordLength: 5,
  totalChars: 5000,
};

const phaseOnePathFixtures = [
  {
    id: "transunion-regional-numbered-disclosure",
    text: transUnionRegionalDisclosureTextFixture,
    bureauName: "TransUnion Canada",
    tradelineCount: 1,
    creditorNames: ["PRAIRIE AUTO CREDIT"],
    bureauReferenceId: "AB-2026-77",
  },
  {
    id: "transunion-exported-portal-two-account-text-order",
    text: transUnionPortalTwoAccountTextOrderFixture,
    bureauName: "TransUnion Canada",
    tradelineCount: 2,
    creditorNames: ["COASTAL CREDIT CARD", "ATLANTIC AUTO LOAN"],
    bureauReferenceId: "PORT-2026-445",
  },
  {
    id: "equifax-mortgage-account-section",
    text: equifaxMortgageTextFixture,
    bureauName: "Equifax Canada",
    tradelineCount: 1,
    creditorNames: ["SAMPLE TRUST MORTGAGE"],
  },
  {
    id: "equifax-collapsed-collection-section",
    text: equifaxCollapsedCollectionsTextFixture,
    bureauName: "Equifax Canada",
    tradelineCount: 2,
    creditorNames: ["EASTERN COLLECTIONS INC", "NORTHERN RECOVERY SERVICES"],
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extractTextFromPdfWithQuality.mockImplementation(async () => ({
    text: mocks.currentText,
    quality: {
      ...validTextQuality,
      totalChars: mocks.currentText.length,
    },
  }));
});

describe("Phase 1 deterministic parser-test and ingest path coverage", () => {
  it.each(phaseOnePathFixtures)(
    "carries $id through the shared canonical PDF parser path",
    async (fixture) => {
      mocks.currentText = fixture.text;

      const result = await parsePdfThroughProductionHtmlPipeline(
        Buffer.from(`synthetic-${fixture.id}`).toString("base64"),
        { allowAiFallback: true, parserMode: "legacy-ai" },
      );

      expect(result.extractionSource).toBe("pdf_text");
      expect(result.replayValidation.ok).toBe(true);
      expect(result.replayHash).toBe(result.deterministicPipeline.replayHash);
      expect(result.parseResult.reportMetadata.bureauName).toBe(fixture.bureauName);
      expect(result.parseResult.tradelines).toHaveLength(fixture.tradelineCount);
      expect(result.canonicalOutput.tradelines).toHaveLength(fixture.tradelineCount);
      expect(result.canonicalOutput.evidence.coverage.requiredCoveragePercent).toBe(100);
      expect(result.canonicalOutput.tradelines.map((tradeline) => tradeline.creditorName)).toEqual(
        fixture.creditorNames,
      );

      if (fixture.bureauReferenceId) {
        expect(result.canonicalOutput.reportMetadata.bureauReferenceId).toBe(fixture.bureauReferenceId);
      }
    },
  );
});
