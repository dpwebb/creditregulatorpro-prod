import { describe, expect, it } from "vitest";
import { detectBureau } from "../../helpers/bureauDetectionRouter";
import { extractConsumerInfo } from "../../helpers/consumerInfoExtractor";
import { extractReportMetadata } from "../../helpers/reportMetadataExtractor";
import { extractTradelines } from "../../helpers/transunionPdfExtractor";
import { parseHtmlToRawText } from "../../helpers/_htmlParserUtils";
import {
  equifaxHtmlFixture,
  transUnionHtmlFixture,
  transUnionTextFixture,
} from "../fixtures/creditReportFixtures";

describe("credit report fixture extraction", () => {
  it("extracts core TransUnion text fields deterministically", () => {
    const metadata = extractReportMetadata(transUnionTextFixture);
    const consumerInfo = extractConsumerInfo(transUnionTextFixture);
    const tradelines = extractTradelines(transUnionTextFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(consumerInfo.fullName).toContain("TEST CONSUMER");
    expect(tradelines.length).toBeGreaterThan(0);
    expect(tradelines[0].creditorName).toBe("BANK OF NOVA SCOTIA");
  });

  it("routes HTML fixtures to the expected bureau parser family", () => {
    expect(detectBureau(transUnionHtmlFixture)).toBe("TransUnion");
    expect(detectBureau(equifaxHtmlFixture)).toBe("Equifax");
    expect(parseHtmlToRawText(transUnionHtmlFixture)).toContain("BANK OF NOVA SCOTIA");
  });
});
