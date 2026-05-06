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
});
