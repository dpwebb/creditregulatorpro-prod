import { describe, expect, it } from "vitest";
import { detectBureau } from "../../helpers/bureauDetectionRouter";
import { extractConsumerInfo } from "../../helpers/consumerInfoExtractor";
import { extractReportMetadata } from "../../helpers/reportMetadataExtractor";
import { extractTradelines } from "../../helpers/transunionPdfExtractor";
import { extractEquifaxTradelines } from "../../helpers/equifaxPdfExtractor";
import { extractCreditLimit, extractAmounts, extractBalance, extractMonthlyPayment } from "../../helpers/tradelineAmountExtractors";
import { extractCollectionTurnoverSignal } from "../../helpers/tradelineBasicInfoExtractors";
import { extractInquiries } from "../../helpers/inquiryExtractor";
import { buildDeterministicCreditReportPipelinePackage } from "../../helpers/deterministicCreditReportPipeline";
import { parseHtmlToRawText } from "../../helpers/_htmlParserUtils";
import {
  equifaxAccountOnlyTextFixture,
  equifaxCollapsedCollectionsTextFixture,
  equifaxInstallmentTextFixture,
  equifaxMortgageTextFixture,
  equifaxTextFixture,
  equifaxHtmlFixture,
  transUnionCollapsedSyntheticFixture,
  transUnionLegacyDisclosureFixture,
  transUnionPortalLayoutFixture,
  transUnionPortalTwoAccountTextOrderFixture,
  transUnionRegionalDisclosureTextFixture,
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

  it("extracts collapsed TransUnion page-header name and address table rows", () => {
    const consumerInfo = extractConsumerInfo(`
JASON ANDREW MILLER , SYN-TU-001Saturday 10 January 2026 19:34
End of Page 1    Synthetic Credit Report Fixture - Not a real credit reportTEST DATA ONLY
SYNTHETIC TEST DATA
NOT FOR CREDIT USE
Personal Information:
SurnameGiven Name(s)Middle NameSuffixSocial Insurance NoBirth Date
Your InformationMILLERJASONANDREWON FILEJul 12, 1984
Address(es):
AddressCityProvPostalTypeOwnSinceTelephone Associations
1179 DUNDAS ST WHAMILTONONL8P1X4HomeMay 09, 20249055550162
42 KING ST ETORONTOONM5C1G8HomeJan 15, 2021
88 RIVER RDKITCHENERONN2G3A1HomeSep 03, 2016
Account(s):
`);

    expect(consumerInfo.fullName).toBe("JASON ANDREW MILLER");
    expect(consumerInfo.addressLine1).toBe("1179 DUNDAS ST W");
    expect(consumerInfo.city).toBe("HAMILTON");
    expect(consumerInfo.province).toBe("ON");
    expect(consumerInfo.postalCode).toBe("L8P 1X4");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1984-07-12");
  });

  it("extracts collapsed TransUnion address rows with multi-word cities", () => {
    const consumerInfo = extractConsumerInfo(`
TransUnion Canada Consumer Disclosure
Personal Information:
Consumer Name TEST CONSUMER
Address(es):
AddressCityProvPostalTypeOwnSinceTelephone Associations
123 MAIN ST NORTH YORKONM2N5V7HomeJan 01, 2024
Account(s):
`);

    expect(consumerInfo.addressLine1).toBe("123 MAIN ST");
    expect(consumerInfo.city).toBe("NORTH YORK");
    expect(consumerInfo.province).toBe("ON");
    expect(consumerInfo.postalCode).toBe("M2N 5V7");
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
    const metadata = extractReportMetadata(transUnionCollapsedSyntheticFixture);
    const tradelines = extractTradelines(transUnionCollapsedSyntheticFixture);

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

  it("keeps Equifax collection agencies separate from original creditors when labels are collapsed", () => {
    const tradelines = extractEquifaxTradelines(`
Equifax Canada
Credit ReportRequest Date 2026/04/16
Collections
NATIONAL LEGAL GROUP
Date Assigned2024/01/01
Member NameNCRI INC
Phone Number
Member Number481YC00465
First Delinquency2021/02/01
Account Number***672
Amount$606
Status
Balance$606
Narrative
Date Paid/Settled
Date Verified
Last Payment Date2021/02/01
NCRI CAPITAL ASSET INC
Date Assigned2023/12/01
Member NameNCRI INC
Phone Number
Member Number481YC00465
First Delinquency2021/02/01
Account Number***672
Amount$816
Status
Balance$816
Narrative
Date Paid/Settled
Date Verified
Last Payment Date2021/02/01
`);

    expect(tradelines).toHaveLength(2);
    expect(tradelines.map((tradeline) => tradeline.creditorName)).toEqual([
      "NATIONAL LEGAL GROUP",
      "NCRI CAPITAL ASSET INC",
    ]);
    expect(tradelines.map((tradeline) => tradeline.collectionAgencyName)).toEqual([
      "NATIONAL LEGAL GROUP",
      "NCRI CAPITAL ASSET INC",
    ]);
    expect(tradelines.map((tradeline) => tradeline.accountNumber)).toEqual(["***672", "***672"]);
    expect(tradelines[0].originalCreditorName).toBeUndefined();
    expect(tradelines[0].dates.dofd?.toISOString().slice(0, 10)).toBe("2021-02-01");
    expect(tradelines[0].dateAssignedToCollection?.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(tradelines[0].lastPaymentDate?.toISOString().slice(0, 10)).toBe("2021-02-01");
    expect(tradelines[0].dates.reported).toBeNull();
    expect(tradelines[1].originalBalance).toBe(816);
  });

  it("extracts Equifax revolving overview fields and does not convert last payment dates into monthly payments", () => {
    const tradelines = extractEquifaxTradelines(`
Equifax Canada
Credit ReportRequest Date 2026/04/16
Accounts - Revolving
CAPITAL ONE BANK
Overview
Account
Number
Phone
Highest
Balance
Notes
Member
Number
Rating
Code
Rating Code Description
***581
800-
728-
3277
$358
Written-off
Closed by
credit grantor
650ON40987R9
Revolving - Bad debt, collection
account or unable to locate
Balance And
Amounts
Account Dates
Balance$248Opened2023/04/25
Credit Limit$300
Last
Reported
026/04/14
Payment
Due
Last
Payment
2023/10/27
Actual
payment
Date
Closed
2024/06/17
Amount
Past Due
$248
Amount
Written Off
$248
Payment Details
Months Reviewed
Payment ResponsibilityIndividual
`);

    expect(tradelines).toHaveLength(1);
    expect(tradelines[0].creditorName).toBe("CAPITAL ONE BANK");
    expect(tradelines[0].accountNumber).toBe("***581");
    expect(tradelines[0].creditorPhone).toBe("800-728-3277");
    expect(tradelines[0].amounts.high).toBe(358);
    expect(tradelines[0].notes).toBe("Written-off Closed by credit grantor");
    expect(tradelines[0].memberNumber).toBe("650ON40987");
    expect(tradelines[0].ratingCode).toBe("R9");
    expect(tradelines[0].ratingCodeDescription).toBe("Revolving - Bad debt, collection account or unable to locate");
    expect(tradelines[0].balance).toBe(248);
    expect(tradelines[0].dates.opened?.toISOString().slice(0, 10)).toBe("2023-04-25");
    expect(tradelines[0].creditLimit).toBe(300);
    expect(tradelines[0].dates.reported?.toISOString().slice(0, 10)).toBe("2026-04-14");
    expect(tradelines[0].lastPaymentDate?.toISOString().slice(0, 10)).toBe("2023-10-27");
    expect(tradelines[0].dates.closed?.toISOString().slice(0, 10)).toBe("2024-06-17");
    expect(tradelines[0].amounts.pastDue).toBe(248);
    expect(tradelines[0].amountWrittenOff).toBe(248);
    expect(tradelines[0].actualPaymentAmount).toBeNull();
    expect(tradelines[0].responsibilityCode).toBe("Individual");
    expect(extractMonthlyPayment(tradelines[0].sourceText ?? "")).toBeNull();
  });

  it("records Equifax overview notes that show creditor-reported collection turnover", () => {
    const tradelines = extractEquifaxTradelines(`
Equifax Canada
Credit ReportRequest Date 2026/04/16
Accounts - Open
FIDO
Overview
Account
Number
Phone
Highest
Balance
Notes
Member
Number
Rating
Code
Rating Code Description
***485
888-
288-
2106
Closed by credit grantor
Acct assigned to third
party for collection
650UT00024O9
Open - Bad debt, collection
account or unable to locate
Balance And
Amounts
Account Dates
Balance$341Opened2020/02/25
Last
Reported
2026/04/29
Last
Payment
2020/08/09
Payment ResponsibilityIndividual
`);

    expect(tradelines).toHaveLength(1);
    expect(tradelines[0].creditorName).toBe("FIDO");
    expect(tradelines[0].accountNumber).toBe("***485");
    expect(tradelines[0].creditorPhone).toBe("888-288-2106");
    expect(tradelines[0].notes).toBe("Closed by credit grantor Acct assigned to third party for collection");
    expect(tradelines[0].memberNumber).toBe("650UT00024");
    expect(tradelines[0].ratingCode).toBe("O9");
    expect(tradelines[0].ratingCodeDescription).toBe("Open - Bad debt, collection account or unable to locate");
    expect(extractCollectionTurnoverSignal(tradelines[0].sourceText ?? "")).toBe(true);
    expect(extractMonthlyPayment(tradelines[0].sourceText ?? "")).toBeNull();
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

  it("extracts regional TransUnion numbered disclosures with case ID, dates, and money fields", () => {
    const metadata = extractReportMetadata(transUnionRegionalDisclosureTextFixture);
    const consumerInfo = extractConsumerInfo(transUnionRegionalDisclosureTextFixture);
    const tradelines = extractTradelines(transUnionRegionalDisclosureTextFixture);

    expect(metadata.bureauName).toBe("TransUnion Canada");
    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-02-05");
    expect(metadata.transUnionCaseId).toBe("AB-2026-77");
    expect(consumerInfo.fullName).toBe("ALEX TESTER");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1982-02-05");
    expect(consumerInfo.postalCode).toBe("E1C 1A1");
    expect(tradelines).toHaveLength(1);
    expect(tradelines[0].creditorName).toBe("PRAIRIE AUTO CREDIT");
    expect(tradelines[0].accountNumber).toBe("********4455");
    expect(tradelines[0].balance).toBe(8765);
    expect(tradelines[0].amounts.high).toBe(325);
    expect(tradelines[0].creditLimit).toBe(16000);
    expect(tradelines[0].dates.opened?.toISOString().slice(0, 10)).toBe("2018-05-14");
    expect(tradelines[0].lastPaymentDate?.toISOString().slice(0, 10)).toBe("2026-01-20");
  });

  it("keeps exported TransUnion portal text order split into exact account records", () => {
    const metadata = extractReportMetadata(transUnionPortalTwoAccountTextOrderFixture);
    const consumerInfo = extractConsumerInfo(transUnionPortalTwoAccountTextOrderFixture);
    const tradelines = extractTradelines(transUnionPortalTwoAccountTextOrderFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-02-05");
    expect(metadata.transUnionCaseId).toBe("PORT-2026-445");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1982-02-05");
    expect(tradelines).toHaveLength(2);
    expect(tradelines.map((tradeline) => tradeline.creditorName)).toEqual([
      "COASTAL CREDIT CARD",
      "ATLANTIC AUTO LOAN",
    ]);
    expect(tradelines[0].balance).toBe(410.25);
    expect(tradelines[0].creditLimit).toBe(1500);
    expect(tradelines[1].balance).toBe(9900);
    expect(tradelines[1].amounts.high).toBe(18500);
    expect(tradelines[1].dates.opened?.toISOString().slice(0, 10)).toBe("2021-09-10");
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

  it("extracts Equifax mortgage account sections without creating extra tradelines", () => {
    const metadata = extractReportMetadata(equifaxMortgageTextFixture);
    const consumerInfo = extractConsumerInfo(equifaxMortgageTextFixture);
    const tradelines = extractEquifaxTradelines(equifaxMortgageTextFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-05-02");
    expect(consumerInfo.postalCode).toBe("E1C 1A1");
    expect(tradelines).toHaveLength(1);
    expect(tradelines[0].creditorName).toBe("SAMPLE TRUST MORTGAGE");
    expect(tradelines[0].accountType).toBe("Mortgage");
    expect(tradelines[0].balance).toBe(245000);
    expect(tradelines[0].amounts.high).toBe(250000);
    expect(tradelines[0].amounts.pastDue).toBe(0);
    expect(tradelines[0].dates.opened?.toISOString().slice(0, 10)).toBe("2019-08-01");
  });

  it("extracts Equifax collection records when labels are collapsed on agency lines", () => {
    const metadata = extractReportMetadata(equifaxCollapsedCollectionsTextFixture);
    const consumerInfo = extractConsumerInfo(equifaxCollapsedCollectionsTextFixture);
    const tradelines = extractEquifaxTradelines(equifaxCollapsedCollectionsTextFixture);

    expect(metadata.reportDate?.toISOString().slice(0, 10)).toBe("2026-05-02");
    expect(consumerInfo.dateOfBirth?.toISOString().slice(0, 10)).toBe("1982-02-05");
    expect(tradelines).toHaveLength(2);
    expect(tradelines.map((tradeline) => tradeline.creditorName)).toEqual([
      "EASTERN COLLECTIONS INC",
      "NORTHERN RECOVERY SERVICES",
    ]);
    expect(tradelines.map((tradeline) => tradeline.isCollectionAccount)).toEqual([true, true]);
    expect(tradelines[0].accountNumber).toBe("***902");
    expect(tradelines[0].originalCreditorName).toBe("ORIGINAL STORE LTD");
    expect(tradelines[0].dateAssignedToCollection?.toISOString().slice(0, 10)).toBe("2024-07-15");
    expect(tradelines[0].originalBalance).toBe(721);
    expect(tradelines[1].dates.dofd?.toISOString().slice(0, 10)).toBe("2023-05-06");
    expect(tradelines[1].balance).toBe(300);
    expect(tradelines[1].originalBalance).toBe(312);
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
