import { describe, expect, it } from "vitest";
import { detectBureau } from "../../helpers/bureauDetectionRouter";
import { extractConsumerInfo } from "../../helpers/consumerInfoExtractor";
import { extractReportMetadata } from "../../helpers/reportMetadataExtractor";
import { extractTradelines } from "../../helpers/transunionPdfExtractor";
import { extractEquifaxTradelines } from "../../helpers/equifaxPdfExtractor";
import { buildDeterministicCreditReportPipelinePackage } from "../../helpers/deterministicCreditReportPipeline";
import { parseHtmlToRawText } from "../../helpers/_htmlParserUtils";
import {
  equifaxTextFixture,
  equifaxHtmlFixture,
  transUnionPortalLayoutFixture,
  transUnionHtmlFixture,
  transUnionTextFixture,
} from "../fixtures/creditReportFixtures";

describe("credit report fixture extraction", () => {
  it("extracts core TransUnion text fields deterministically", () => {
    const metadata = extractReportMetadata(transUnionTextFixture);
    const consumerInfo = extractConsumerInfo(transUnionTextFixture);
    const tradelines = extractTradelines(transUnionTextFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(metadata.transUnionCaseId).toBe("L121322");
    expect(consumerInfo.fullName).toContain("TEST CONSUMER");
    expect(tradelines.length).toBeGreaterThan(0);
    expect(tradelines[0].creditorName).toBe("BANK OF NOVA SCOTIA");
  });

  it("does not map plain case IDs outside TransUnion report context", () => {
    const metadata = extractReportMetadata(`
Equifax Canada
Case ID ABC12345
Credit Report Request Date 2026/04/16
`);

    expect(metadata.transUnionCaseId).toBeNull();
  });

  it("extracts TransUnion DOB when personal-info cells are collapsed together", () => {
    const consumerInfo = extractConsumerInfo(`
TransUnion Canada Consumer Disclosure
Personal Information:
SurnameGiven Name(s)Middle NameSuffixSocial Insurance NoBirth Date
Your InformationTEST CONSUMERON FILEJan 30, 1961
Cross Reference(s):
`);

    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1961-01-30");
    expect(consumerInfo.dateOfBirthRaw).toBe("Jan 30, 1961");
  });

  it("routes HTML fixtures to the expected bureau parser family", () => {
    expect(detectBureau(transUnionHtmlFixture)).toBe("TransUnion");
    expect(detectBureau(equifaxHtmlFixture)).toBe("Equifax");
    expect(parseHtmlToRawText(transUnionHtmlFixture)).toContain("BANK OF NOVA SCOTIA");
  });

  it("extracts Equifax account sections and collections without fixed line positions", () => {
    const metadata = extractReportMetadata(equifaxTextFixture);
    const consumerInfo = extractConsumerInfo(equifaxTextFixture);
    const tradelines = extractEquifaxTradelines(equifaxTextFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-04-16");
    expect(metadata.bureauName).toBe("Equifax Canada");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1961-01-30");
    expect(tradelines.map((tradeline) => tradeline.creditorName)).toContain("CAPITAL ONE BANK");
    expect(tradelines.some((tradeline) => tradeline.isCollectionAccount)).toBe(true);
  });

  it("detects semantic zones for Equifax and exported portal layouts", () => {
    const equifaxTradelines = extractEquifaxTradelines(equifaxTextFixture);
    const equifaxPackage = buildDeterministicCreditReportPipelinePackage({
      parseResult: {
        rawText: equifaxTextFixture,
        sourceBureau: { bureauName: "Equifax Canada", confidence: 100 },
        reportMetadata: extractReportMetadata(equifaxTextFixture),
        consumerInfo: extractConsumerInfo(equifaxTextFixture),
        tradelines: equifaxTradelines,
        creditScores: [],
        inquiries: [],
        publicRecords: [],
        consumerStatements: [],
        employmentInfo: [],
        paymentHistories: [],
      },
      rawText: equifaxTextFixture,
      documentBinarySha256: "equifax-fixture-sha",
    });
    const transUnionPortalPackage = buildDeterministicCreditReportPipelinePackage({
      parseResult: {
        rawText: transUnionPortalLayoutFixture,
        sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
        reportMetadata: extractReportMetadata(transUnionPortalLayoutFixture),
        consumerInfo: extractConsumerInfo(transUnionPortalLayoutFixture),
        tradelines: extractTradelines(transUnionPortalLayoutFixture),
        creditScores: [],
        inquiries: [],
        publicRecords: [],
        consumerStatements: [],
        employmentInfo: [],
        paymentHistories: [],
      },
      rawText: transUnionPortalLayoutFixture,
      documentBinarySha256: "portal-fixture-sha",
    });

    expect(equifaxPackage.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("tradeline_accounts");
    expect(equifaxPackage.finalOutput.fields["tradelines[0].creditorName"].value).toBe("CAPITAL ONE BANK");
    expect(transUnionPortalPackage.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("consumer_identity");
    expect(transUnionPortalPackage.finalOutput.fields["consumerInfo.dateOfBirth"].normalizedValue).toBe("1961-01-30");
  });
});
