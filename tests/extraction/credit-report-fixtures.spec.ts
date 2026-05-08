import { describe, expect, it } from "vitest";
import { detectBureau } from "../../helpers/bureauDetectionRouter";
import { extractConsumerInfo } from "../../helpers/consumerInfoExtractor";
import { extractReportMetadata } from "../../helpers/reportMetadataExtractor";
import { extractTradelines } from "../../helpers/transunionPdfExtractor";
import { extractEquifaxTradelines } from "../../helpers/equifaxPdfExtractor";
import { extractCreditLimit, extractAmounts, extractBalance } from "../../helpers/tradelineAmountExtractors";
import { extractInquiries } from "../../helpers/inquiryExtractor";
import { buildDeterministicCreditReportPipelinePackage } from "../../helpers/deterministicCreditReportPipeline";
import { parseHtmlToRawText } from "../../helpers/_htmlParserUtils";
import {
  equifaxAccountOnlyTextFixture,
  equifaxInstallmentTextFixture,
  equifaxTextFixture,
  equifaxHtmlFixture,
  transUnionLegacyDisclosureFixture,
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

    expect(consumerInfo.fullName).toBe("TEST CONSUMER");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1961-01-30");
    expect(consumerInfo.dateOfBirthRaw).toBe("Jan 30, 1961");
  });

  it("does not promote inquiry telephone values to consumer phone", () => {
    const consumerInfo = extractConsumerInfo(`
TransUnion Canada Consumer Disclosure
Personal Information:
Your Information TEST CONSUMER ON FILE Jan 30, 1961
Address(es):
26 MAIN ST E PO BOX 593
STEWIACKE NS B0N 2J0
Credit Related Inquiries:
Date Authorized User Telephone
Sep 12, 2025ROYAL BANK VISA8007692512
`);

    expect(consumerInfo.fullName).toBe("TEST CONSUMER");
    expect(consumerInfo.addressLine1).toBe("26 MAIN ST E");
    expect(consumerInfo.addressLine2).toBe("PO BOX 593");
    expect(consumerInfo.phone).toBeNull();
  });

  it("extracts space-delimited inline Canadian current addresses", () => {
    const consumerInfo = extractConsumerInfo(`
TransUnion Canada Consumer Disclosure
Personal Information:
Consumer Name TEST CONSUMER
Current Address: 101 TEST AVE HALIFAX NS B3J 1A1
Account(s):
Creditor Name
CAPITAL ONE BANK
`);

    expect(consumerInfo.addressLine1).toBe("101 TEST AVE");
    expect(consumerInfo.city).toBe("HALIFAX");
    expect(consumerInfo.province).toBe("NS");
    expect(consumerInfo.postalCode).toBe("B3J 1A1");
  });

  it("keeps missing and adjacent monetary fields distinct", () => {
    expect(extractBalance("Creditor Name SAMPLE\nStatus Open\nOpened Date 2026-01-01")).toBeNull();
    expect(extractCreditLimit("Available Credit: $900")).toBeNull();
    expect(extractAmounts("Credit Limit: $1,000")).toEqual({
      high: undefined,
      pastDue: undefined,
    });
  });

  it("does not merge separate TransUnion accounts from the same creditor", () => {
    const tradelines = extractTradelines(`
Account(s):
Creditor Name
SAMPLE BANK
Account TypeREVOLVING / INDIVIDUAL
StatusOpen
Opened DateJan 01, 2020
Reported DateJan 10, 2026
Payment History
Jan 202610100010000

Creditor Name
SAMPLE BANK
Account TypeREVOLVING / INDIVIDUAL
StatusOpen
Opened DateFeb 01, 2021
Reported DateJan 10, 2026
Payment History
Jan 202620200020000
`);

    expect(tradelines).toHaveLength(2);
    expect(tradelines.map((tradeline) => tradeline.dates.opened?.toISOString().slice(0, 10))).toEqual([
      "2020-01-01",
      "2021-02-01",
    ]);
  });

  it("splits collapsed TransUnion creditor-label rows into separate tradelines", () => {
    const text = `
JASON ANDREW MILLER , SYN-TU-001Saturday 10 January 2026 19:34
Account(s):
This section lists synthetic accounts reported by fictional institutions.
Creditor NameMAPLE FINANCIAL VISAPayment History
Reported DateDec 16, 2025Last Payment DateJan 14, 202730  3
Opened DateApr 13, 2021Posted DateDec 18, 202560  1
Closed DateCharge Off Date90  0
First Delinquency DateSep 14, 2025Terms0/M#M  44
Account TypeREVOLVING / INDIVIDUAL
DateBalancePaymentPast DueMOPTermsHigh CreditCredit LimitBalloon PaymentCharge OffNarrative 1 / 2
Dec 20256120150730506120500000XR /
Nov 20255870150580405870500000
Legend: AC-Account current/non-derogatory, CG-Account cancelled by credit grantor, TC-Third party collection, WO-Write-off, CZ-Closed at consumer request,
X-Unknown, PD-Paid.
Creditor NameNORTHERN AUTO FINANCEPayment History
Reported DateNov 30, 2025Last Payment DateNov 14, 202530  0
Opened DateJun 18, 2022Posted DateDec 02, 202560  0
Closed DateCharge Off Date90  0
First Delinquency DateTerms60/M#M  42
Account TypeINSTALLMENT / INDIVIDUAL
DateBalancePaymentPast DueMOPTermsHigh CreditCredit LimitBalloon PaymentCharge OffNarrative 1 / 2
Nov 202511244492016028750000AC /
Oct 202511736492016028750000
Legend: AC-Account current/non-derogatory, CG-Account cancelled by credit grantor, TC-Third party collection, WO-Write-off, CZ-Closed at consumer request,
X-Unknown, PD-Paid.
Credit Related Inquiries:
`;

    const metadata = extractReportMetadata(text);
    const tradelines = extractTradelines(text);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(tradelines).toHaveLength(2);
    expect(tradelines.map((tradeline) => tradeline.creditorName)).toEqual([
      "MAPLE FINANCIAL VISA",
      "NORTHERN AUTO FINANCE",
    ]);
    expect(tradelines[0].balance).toBe(6120);
    expect(tradelines[0].creditLimit).toBe(5000);
    expect(tradelines[0].lastPaymentDate?.toISOString().slice(0, 10)).toBe("2027-01-14");
  });

  it("keeps Equifax collection assignment separate from opened date", () => {
    const tradelines = extractEquifaxTradelines(`
Equifax Canada
Credit ReportRequest Date 2026/04/16
Collections
SAMPLE COLLECTIONS
Account
Number
********1234
Date Assigned 2024/02/03
Date Verified 2026/04/01
Amount $500.00
Status Collection
Member Name SAMPLE ORIGINAL
Member Number M123
`);

    expect(tradelines).toHaveLength(1);
    expect(tradelines[0].isCollectionAccount).toBe(true);
    expect(tradelines[0].creditorName).toBe("SAMPLE COLLECTIONS");
    expect(tradelines[0].dates.opened).toBeNull();
    expect(tradelines[0].dateAssignedToCollection?.toISOString().slice(0, 10)).toBe("2024-02-03");
    expect(tradelines[0].originalBalance).toBe(500);
    expect(tradelines[0].amounts.high).toBeUndefined();
    expect(tradelines[0].amounts.pastDue).toBeUndefined();
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
    expect(tradelines.map((tradeline) => tradeline.creditorName)).toContain("CBV COLLECTION SERVICES");
    expect(tradelines.some((tradeline) => tradeline.isCollectionAccount)).toBe(true);
  });

  it("extracts TransUnion legacy numbered section layouts without fixed line positions", () => {
    const metadata = extractReportMetadata(transUnionLegacyDisclosureFixture);
    const consumerInfo = extractConsumerInfo(transUnionLegacyDisclosureFixture);
    const tradelines = extractTradelines(transUnionLegacyDisclosureFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(metadata.transUnionCaseId).toBe("L999888");
    expect(consumerInfo.fullName).toBe("SAMPLE CONSUMER");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1961-01-30");
    expect(consumerInfo.postalCode).toBe("B3J 1A1");
    expect(tradelines).toHaveLength(1);
    expect(tradelines[0].creditorName).toBe("SAMPLE BANK VISA");
    expect(tradelines[0].balance).toBe(2345.67);
    expect(tradelines[0].dates.reported?.toISOString().slice(0, 10)).toBe("2026-01-10");
  });

  it("extracts Equifax installment sections and does not promote account-only creditors to consumer identity", () => {
    const installmentConsumerInfo = extractConsumerInfo(equifaxInstallmentTextFixture);
    const installmentTradelines = extractEquifaxTradelines(equifaxInstallmentTextFixture);
    const accountOnlyConsumerInfo = extractConsumerInfo(equifaxAccountOnlyTextFixture);
    const accountOnlyTradelines = extractEquifaxTradelines(equifaxAccountOnlyTextFixture);

    expect(installmentConsumerInfo.fullName).toBe("SAMPLE CONSUMER");
    expect(installmentConsumerInfo.postalCode).toBe("B3J 1A1");
    expect(installmentTradelines).toHaveLength(1);
    expect(installmentTradelines[0].creditorName).toBe("SAMPLE AUTO FINANCE");
    expect(installmentTradelines[0].accountType).toBe("Installment");
    expect(installmentTradelines[0].balance).toBe(12345);
    expect(installmentTradelines[0].dates.reported?.toISOString().slice(0, 10)).toBe("2026-04-16");

    expect(accountOnlyConsumerInfo.fullName).toBeNull();
    expect(accountOnlyConsumerInfo.postalCode).toBeNull();
    expect(accountOnlyTradelines).toHaveLength(1);
    expect(accountOnlyTradelines[0].creditorName).toBe("SAMPLE TELCO");
    expect(accountOnlyTradelines[0].balance).toBe(89.1);
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
    expect(equifaxPackage.finalOutput.fields["tradelines[1].creditorName"].normalizedValue).toBe("CBV COLLECTION SERVICES");
    expect(equifaxPackage.finalOutput.evidence.coverage.requiredCoveragePercent).toBe(100);
    expect(transUnionPortalPackage.semanticZoneDetection.zones.map((zone) => zone.zoneName)).toContain("consumer_identity");
    expect(transUnionPortalPackage.finalOutput.fields["consumerInfo.dateOfBirth"].normalizedValue).toBe("1961-01-30");
    expect(transUnionPortalPackage.finalOutput.evidence.coverage.requiredCoveragePercent).toBe(100);
  });

  it("canonicalizes side-channel bureau facts with evidence", () => {
    const text = `
TransUnion Canada Consumer Disclosure
Your file as of Jan 10, 2026
TU Case IDL121322
Personal Information:
Your Information TEST CONSUMER ON FILE Jan 30, 1961
Credit Related Inquiries:
Date Authorized User Telephone
Sep 12, 2025ROYAL BANK VISA8007692512
`;
    const inquiries = extractInquiries(text);
    const packageResult = buildDeterministicCreditReportPipelinePackage({
      parseResult: {
        rawText: text,
        sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
        reportMetadata: extractReportMetadata(text),
        consumerInfo: extractConsumerInfo(text),
        tradelines: [],
        creditScores: [],
        inquiries,
        publicRecords: [],
        consumerStatements: [],
        employmentInfo: [],
        paymentHistories: [],
      },
      rawText: text,
      documentBinarySha256: "side-channel-sha",
    });

    expect(packageResult.finalOutput.reportMetadata.bureauReferenceId).toBe("L121322");
    expect(packageResult.finalOutput.inquiries[0].phone).toBe("8007692512");
    expect(packageResult.finalOutput.fields["inquiries[0].phone"].evidence.textSnippet).toContain("ROYAL BANK VISA");
    expect(packageResult.candidatePools.some((pool) => pool.fieldKey === "inquiries[0].phone")).toBe(true);
  });
});
