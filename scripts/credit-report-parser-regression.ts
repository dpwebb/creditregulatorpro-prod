import { generateAnonymousPreview } from "../helpers/anonymousCompliancePreview";
import { extractConsumerInfo } from "../helpers/consumerInfoExtractor";
import { extractConsumerStatements } from "../helpers/consumerStatementExtractor";
import { extractCreditScores } from "../helpers/creditScoreExtractor";
import { extractEmploymentInfo } from "../helpers/employmentExtractor";
import { extractInquiries } from "../helpers/inquiryExtractor";
import { extractReportMetadata } from "../helpers/reportMetadataExtractor";
import { extractBalance } from "../helpers/tradelineAmountExtractors";
import { extractLastPaymentDate } from "../helpers/tradelineDateExtractors";
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

function runFieldExtractionRegression(): void {
  const metadata = extractReportMetadata(transUnionText);
  assert(isoDate(metadata.reportDate) === "2026-01-10", "TransUnion report date should be extracted from file-as-of text.");

  const consumer = extractConsumerInfo(transUnionText);
  assert(isoDate(consumer.dateOfBirth) === "1961-01-30", "TransUnion DOB should be extracted from collapsed personal-info row.");
  assert(consumer.dateOfBirthRaw === "Jan 30, 1961", "Raw DOB should preserve the visible date string.");
  assert(consumer.phone === "(647) 612-7729", "Consumer phone should come from Telephone Number(s), not bureau contact numbers.");

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
Mar 202534103419000TC / CG
`;
  assert(extractBalance(fidoSection) === 341, "TransUnion compact payment grid should provide the latest balance.");
  assert(isoDate(extractLastPaymentDate(fidoSection)) === "2020-08-09", "Concatenated Last Payment Date should parse.");
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
