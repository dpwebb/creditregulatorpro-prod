import { generateAnonymousPreview } from "../helpers/anonymousCompliancePreview";
import { extractConsumerInfo } from "../helpers/consumerInfoExtractor";
import { extractConsumerStatements } from "../helpers/consumerStatementExtractor";
import { extractCreditScores } from "../helpers/creditScoreExtractor";
import { extractEmploymentInfo } from "../helpers/employmentExtractor";
import { extractInquiries } from "../helpers/inquiryExtractor";
import { extractReportMetadata } from "../helpers/reportMetadataExtractor";
import { extractBalance } from "../helpers/tradelineAmountExtractors";
import { extractLastPaymentDate } from "../helpers/tradelineDateExtractors";
import { extractTradelines } from "../helpers/transunionPdfExtractor";
import { extractTransUnionPaymentGridRows } from "../helpers/transunionTextParsing";
import type { ComprehensiveParseResult, ParsedTradeline } from "../helpers/reportParserTypes";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function isoDate(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

const transUnionText = `
TransUnion Canada Consumer Disclosure
Your file as of Jan 10, 2026
first reported to TransUnion on Sep 06, 1989 and was last reviewed by [*CONSUMER DISCLOSURE *] on Jan 10, 2026

Personal Information:
Your Information TEST CONSUMER ON FILE Jan 30, 1961

Address(es):
26 MAIN ST E PO BOX 593
STEWIACKE NS B0N 2J0

Telephone Number(s):
Qualifier Number Ext Type Date
Home6476127729Jul 24, 2025

Employment(s):
Date Employer Occupation Start Date
Aug 31, 2011WEBB DYNAMICSSELFAug 01, 2008

Account(s):
Creditor Name
BANK OF NOVA SCOTIA
Account TypeINSTALLMENT / INDIVIDUAL
StatusAccount Closed
Opened DateSep 03, 2011
Reported DateOct 31, 2013
Last Payment DateOct 03, 2013
Payment History
Oct 20130052200AC /

Creditor Name
FIDO
Account TypeOPEN / INDIVIDUAL
StatusCancelled by Credit Grantor
Opened DateFeb 25, 2020
Reported DateDec 30, 2025
Last Payment DateAug 09, 2020
Payment History
Mar 202534103419000TC / CG

Credit Related Inquiries:
Date Authorized User Telephone
Sep 12, 2025ROYAL BANK VISA8007692512

Non-Credit Related Inquiries:
Jan 09, 2026TRANSUNION CANADA8006639980

Need to dispute something?
INVESTIGATION REQUEST FORM

*** This completes the report ***
`;

const equifaxText = `
Equifax Canada
Credit ReportRequest Date 2026/04/16
Personal File Number 3708406180
Personal Info
Accounts - Revolving
CAPITAL ONE BANK
`;

const transUnionDelayedHeaderText = `
TransUnion Canada
${"Consumer disclosure explanatory boilerplate. ".repeat(130)}
Information regarding your credit history was first reported to TransUnion on Sep 06, 1989 and was last reviewed by [*
CONSUMER DISCLOSURE *] on Jan 10, 2026.
The information in the remainder of this report represents the contents of
your file as of Jan 10, 2026. Blank areas indicate that this information was not reported to TransUnion.
Personal Information:
`;

function runFieldExtractionRegression(): void {
  const metadata = extractReportMetadata(transUnionText);
  assert(isoDate(metadata.reportDate) === "2026-01-10", "TransUnion report date should be extracted from file-as-of text.");

  const delayedTransUnionMetadata = extractReportMetadata(transUnionDelayedHeaderText);
  assert(isoDate(delayedTransUnionMetadata.reportDate) === "2026-01-10", "TransUnion report date should be found when boilerplate pushes the file-as-of header past the first page text.");

  const equifaxMetadata = extractReportMetadata(equifaxText);
  assert(isoDate(equifaxMetadata.reportDate) === "2026-04-16", "Equifax Request Date should be extracted from collapsed PDF header text.");

  const consumer = extractConsumerInfo(transUnionText);
  assert(isoDate(consumer.dateOfBirth) === "1961-01-30", "TransUnion DOB should be extracted from collapsed personal-info row.");
  assert(consumer.dateOfBirthRaw === "Jan 30, 1961", "Raw DOB should preserve the visible date string.");
  assert(consumer.phone === "(647) 612-7729", "Consumer phone should come from Telephone Number(s), not bureau contact numbers.");

  const collapsedDobConsumer = extractConsumerInfo(`
TransUnion Canada Consumer Disclosure
Personal Information:
SurnameGiven Name(s)Middle NameSuffixSocial Insurance NoBirth Date
Your InformationTEST CONSUMERON FILEJan 30, 1961
Cross Reference(s):
`);
  assert(isoDate(collapsedDobConsumer.dateOfBirth) === "1961-01-30", "TransUnion DOB should parse when pdf text joins ON FILE and the date.");
  assert(collapsedDobConsumer.dateOfBirthRaw === "Jan 30, 1961", "Raw DOB should be preserved when the month is joined to the previous table cell.");

  const inquiries = extractInquiries(transUnionText);
  assert(inquiries.length === 2, "TransUnion credit and non-credit inquiries should be parsed.");
  assert(inquiries[0].creditorName === "ROYAL BANK VISA", "Hard inquiry creditor should be parsed from collapsed row.");
  assert(inquiries[0].inquiryType === "hard", "Credit Related Inquiries should map to hard inquiries.");
  assert(inquiries[1].inquiryType === "soft", "Non-Credit Related Inquiries should map to soft inquiries.");

  const statements = extractConsumerStatements(transUnionText);
  assert(statements.length === 0, "Instructional dispute boilerplate should not become consumer statements.");

  const employments = extractEmploymentInfo(transUnionText);
  assert(employments.length === 1, "TransUnion employment row should be parsed.");
  assert(employments[0].employerName === "WEBB DYNAMICS", "Collapsed employment employer should be separated from occupation.");
  assert(employments[0].occupation === "SELF", "Collapsed employment occupation should be parsed.");

  const scores = extractCreditScores(transUnionText);
  assert(scores.length === 0, "TransUnion educational scoring boilerplate should not create false score records.");

  const fidoSection = `
Creditor Name
FIDO
Account TypeOPEN / INDIVIDUAL
StatusCancelled by Credit Grantor
Opened DateFeb 25, 2020
Reported DateDec 30, 2025
Last Payment DateAug 09, 2020
Payment History
30 60 90 #M
1 2 3 24
Mar 202534103419000TC / CG
`;
  assert(extractBalance(fidoSection) === 341, "TransUnion compact payment grid should provide the latest balance.");
  assert(isoDate(extractLastPaymentDate(fidoSection)) === "2020-08-09", "Concatenated Last Payment Date should parse.");
  const fidoTradeline = extractTradelines(fidoSection)[0];
  assert(fidoTradeline.paymentHistoryProfile === "30d:1 60d:2 90d:3 months:24", "TransUnion payment profile should preserve 30/60/90/#M summary.");
  assert(fidoTradeline.paymentHistory?.["30"] === 1, "TransUnion 30-day late count should map to payment history summary.");
  assert(fidoTradeline.paymentHistory?.["60"] === 2, "TransUnion 60-day late count should map to payment history summary.");
  assert(fidoTradeline.paymentHistory?.["90"] === 3, "TransUnion 90-day late count should map to payment history summary.");
  assert(String(fidoTradeline.monthsReviewed) === "24", "TransUnion #M value should map to monthsReviewed.");
  assert(fidoTradeline.paymentHistoryDetails?.[0]?.balance === 341, "TransUnion compact monthly detail should preserve balance.");
  assert(fidoTradeline.paymentHistoryDetails?.[0]?.payment === 0, "TransUnion compact monthly detail should preserve payment.");
  assert(fidoTradeline.paymentHistoryDetails?.[0]?.pastDue === 341, "TransUnion compact monthly detail should preserve past due from the visible column.");
  assert(fidoTradeline.paymentHistoryDetails?.[0]?.mop === "9", "TransUnion compact monthly detail should preserve MOP from the visible column.");
  assert(fidoTradeline.paymentHistoryDetails?.[0]?.narrative === "TC / CG", "TransUnion compact monthly detail should preserve narrative code.");

  const bankOfNovaScotiaSection = `
Creditor Name
BANK OF NOVA SCOTIAPayment History
30
0
60
0
90
0
#M
26
Reported DateOct 31, 2013
Opened DateSep 03, 2011
Closed Date
First Delinquency Date
Last Payment DateOct 03, 2013
Posted DateNov 02, 2013
Charge Off Date
Balloon Payment Date
Terms:522/M
Account
Type:
INSTALLMENT / INDIVIDUAL
DateBalancePaymentPast DueMOPTermsHigh CreditCredit Limit
Balloon
Payment
Charge Off
Narrative
1 / 2
Oct 20130015223132000AC /
Legend:AC-Account closed/rating non derogatory
`;
  const scotiaRows = extractTransUnionPaymentGridRows(bankOfNovaScotiaSection);
  assert(scotiaRows.length === 1, "Bank of Nova Scotia compact row should parse as one monthly row.");
  assert(scotiaRows[0].balance === 0, "Bank of Nova Scotia compact row should preserve balance.");
  assert(scotiaRows[0].payment === null, "Bank of Nova Scotia compact row should leave blank payment blank.");
  assert(scotiaRows[0].pastDue === 0, "Bank of Nova Scotia compact row should not steal past due from the MOP digit.");
  assert(scotiaRows[0].mop === "1", "Bank of Nova Scotia compact row should preserve the MOP digit.");
  assert(scotiaRows[0].terms === "522", "Bank of Nova Scotia compact row should preserve the full row terms.");
  assert(scotiaRows[0].highCredit === 31320, "Bank of Nova Scotia compact row should preserve full high credit.");
  assert(scotiaRows[0].creditLimit === null, "Bank of Nova Scotia compact row should leave missing credit limit blank.");

  const scotiaTradeline = extractTradelines(bankOfNovaScotiaSection)[0];
  assert(scotiaTradeline.amounts.high === 31320, "Bank of Nova Scotia high credit should use the layout-aware compact row.");
  assert(scotiaTradeline.amounts.pastDue === 0, "Bank of Nova Scotia past due should use the layout-aware compact row.");
  assert(scotiaTradeline.creditLimit === undefined, "Bank of Nova Scotia credit limit should stay blank when no value is under that column.");
  assert(scotiaTradeline.remarkCodes.includes("AC-Account closed/rating non derogatory"), "Bank of Nova Scotia Legend value should map to remarkCodes.");

  const capitalOneSection = `
Creditor Name
CAPITAL ONE BANKPayment History
30
1
60
1
90
21
#M
32
Reported DateDec 16, 2025
Opened DateApr 25, 2023
Closed DateJun 17, 2024
First Delinquency DateDec 16, 2023
Last Payment DateOct 27, 2023
Posted DateDec 18, 2025
Charge Off Date
Balloon Payment Date
Terms:0/M
Account
Type:
REVOLVING / INDIVIDUAL
DateBalancePaymentPast DueMOPTermsHigh CreditCredit Limit
Balloon
Payment
Charge Off
Narrative
1 / 2
Jul 2024248248903583000WO / CG
Jun 2024X
May 2024242505051135830000
Apr 2024179504051035830000
Mar 2024176503041035830000
Feb 2024172502031035830000
Jan 2024168501021035830000
Legend:CG-Account cancelled by credit grantor with derogatory rating,  WO-Bad debt write-off,  X-Unknown
`;
  const capitalRows = extractTransUnionPaymentGridRows(capitalOneSection);
  assert(capitalRows.length === 7, "TransUnion compact payment rows should split at month-year boundaries even when the year touches the amount.");
  assert(capitalRows[0].dateLabel === "Jul 2024", "TransUnion compact payment rows should preserve the latest row label.");
  assert(capitalRows[0].balance === 248, "TransUnion compact Capital One row should preserve latest balance.");
  assert(capitalRows[0].payment === 248, "TransUnion compact Capital One row should preserve latest payment.");
  assert(capitalRows[0].pastDue === 9, "TransUnion compact Capital One row should preserve latest past due.");
  assert(capitalRows[0].mop === "0", "TransUnion compact Capital One row should preserve latest MOP.");
  assert(capitalRows[0].highCredit === 358, "TransUnion compact Capital One row should preserve high credit.");
  assert(capitalRows[0].creditLimit === 300, "TransUnion compact Capital One row should preserve credit limit.");
  assert(capitalRows[1].mop === "X", "TransUnion compact X rows should remain separate unknown rows.");
  assert(capitalRows[2].terms === "11", "TransUnion compact Capital One row should preserve row-level terms.");

  const capitalTradeline = extractTradelines(capitalOneSection)[0];
  assert(capitalTradeline.balance === 248, "Capital One tradeline balance should use the latest compact payment row.");
  assert(capitalTradeline.amounts.high === 358, "Capital One high credit should not be parsed as a concatenated number.");
  assert(capitalTradeline.amounts.pastDue === 9, "Capital One past due should use the latest compact payment row.");
  assert(capitalTradeline.creditLimit === 300, "Capital One credit limit should use the latest compact payment row.");
  assert(capitalTradeline.paymentHistory?.["30"] === 1, "Capital One vertical TransUnion 30-day count should be parsed.");
  assert(capitalTradeline.paymentHistory?.["60"] === 1, "Capital One vertical TransUnion 60-day count should be parsed.");
  assert(capitalTradeline.paymentHistory?.["90"] === 21, "Capital One vertical TransUnion 90-day count should be parsed.");
  assert(capitalTradeline.paymentHistory?.["#M"] === 32, "Capital One vertical TransUnion #M count should be parsed.");
  assert(capitalTradeline.remarkCodes.includes("CG-Account cancelled by credit grantor with derogatory rating"), "Capital One Legend CG value should map to remarkCodes.");
  assert(capitalTradeline.remarkCodes.includes("WO-Bad debt write-off"), "Capital One Legend WO value should map to remarkCodes.");
  assert(capitalTradeline.remarkCodes.includes("X-Unknown"), "Capital One Legend unknown value should map to remarkCodes.");
}

function tradeline(input: Partial<ParsedTradeline>): ParsedTradeline {
  return {
    accountNumber: "Unknown",
    creditorName: "Unknown",
    accountType: "Unknown",
    balance: 0,
    status: "Unknown",
    dates: {},
    amounts: {},
    remarkCodes: [],
    ...input,
  };
}

function runPreviewRegression(): void {
  const parseResult: ComprehensiveParseResult = {
    rawText: transUnionText,
    sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
    consumerInfo: {
      fullName: "TEST CONSUMER",
      addressLine1: "26 MAIN ST E",
      addressLine2: null,
      city: "STEWIACKE",
      province: "NS",
      postalCode: "B0N 2J0",
      dateOfBirth: new Date("1961-01-30"),
      dateOfBirthRaw: "Jan 30, 1961",
      phone: "(647) 612-7729",
      previousAddresses: [],
      confidence: 100,
    },
    reportMetadata: {
      reportDate: new Date("2026-01-10"),
      reportNumber: null,
      fileNumber: null,
      bureauFileId: null,
      bureauName: "TransUnion Canada",
      bureauPhone: "1-800-663-9980",
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
      confidence: 80,
    },
    tradelines: [
      tradeline({
        creditorName: "BANK OF NOVA SCOTIA",
        accountType: "INSTALLMENT",
        status: "Account Closed",
        balance: 0,
        dates: {
          opened: new Date("2011-09-03"),
          reported: new Date("2013-10-31"),
        },
        lastPaymentDate: new Date("2013-10-03"),
      }),
      tradeline({
        creditorName: "FIDO",
        accountType: "OPEN",
        status: "Cancelled by Credit Grantor",
        balance: 341,
        dates: {
          opened: new Date("2020-02-25"),
          reported: new Date("2025-12-30"),
        },
        lastPaymentDate: new Date("2020-08-09"),
      }),
      tradeline({
        creditorName: "ROGERS COMMUNICATIONS CANADA INC",
        accountType: "OPEN",
        status: "TC / CG",
        balance: 0,
        dates: {
          opened: new Date("2017-05-12"),
          reported: new Date("2019-11-30"),
        },
        lastPaymentDate: new Date("2018-03-15"),
      }),
    ],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
  };

  const preview = generateAnonymousPreview(parseResult);
  assert(preview.some((problem) => problem.title.includes("BANK OF NOVA SCOTIA") && problem.type === "sol_expired"), "Closed zero-balance accounts with an old last-payment clock should be marked expired.");
  assert(preview.some((problem) => problem.title.includes("ROGERS COMMUNICATIONS CANADA INC") && problem.type === "sol_expired"), "Terminal/derogatory accounts with an old last-payment clock should be marked expired.");
  assert(!preview.some((problem) => problem.type === "missing_dates" && problem.urgency === "violation"), "Missing parser dates should not be converted into violation claims.");

  const manyExpiredPreview = generateAnonymousPreview({
    ...parseResult,
    tradelines: Array.from({ length: 6 }, (_, index) =>
      tradeline({
        creditorName: `EXPIRED ACCOUNT ${index + 1}`,
        accountType: "INSTALLMENT",
        status: "Account Closed",
        balance: 0,
        dates: {
          opened: new Date("2010-01-01"),
          reported: new Date("2014-01-01"),
        },
        lastPaymentDate: new Date("2013-01-01"),
      })
    ),
  });
  assert(manyExpiredPreview.filter((problem) => problem.type === "sol_expired").length === 6, "Anonymous preview should show every verified expired tradeline, not only the top five.");

  const openedDateOnlyPreview = generateAnonymousPreview({
    ...parseResult,
    tradelines: [
      tradeline({
        creditorName: "OLD OPENED DATE ONLY",
        accountType: "INSTALLMENT",
        status: "Account Closed",
        balance: 0,
        dates: {
          opened: new Date("2011-09-03"),
        },
      }),
    ],
  });
  assert(!openedDateOnlyPreview.some((problem) => problem.title.includes("OLD OPENED DATE ONLY") && problem.type === "sol_expired"), "Opened date alone should not create an expired-reporting claim.");
}

runFieldExtractionRegression();
runPreviewRegression();

console.log("Credit report parser regression passed.");
