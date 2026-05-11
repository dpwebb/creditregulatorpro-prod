export const transUnionTextFixture = `
TransUnion Canada Consumer Disclosure
Your file as of Jan 10, 2026
TU Case IDL121322

Personal Information:
Consumer Name: TEST CONSUMER
Birth Date Jan 30, 1961

Address(es):
26 MAIN ST E
STEWIACKE NS B0N 2J0

Account(s):
Creditor Name BANK OF NOVA SCOTIA
Account Type INSTALLMENT / INDIVIDUAL
Status Account Closed
Opened Date Sep 03, 2011
Reported Date Oct 31, 2013
Last Payment Date Oct 03, 2013
Payment History
Oct 2013 0 0 0 1 522 31320 0 0 AC /

Credit Related Inquiries:
Sep 12, 2025 ROYAL BANK VISA 8007692512
`;

export const transUnionHtmlFixture = `
<html>
  <body>
    <h1>TransUnion Canada Consumer Disclosure</h1>
    <table>
      <tr><th>Creditor Name</th><td>BANK OF NOVA SCOTIA</td></tr>
      <tr><th>Account Type</th><td>INSTALLMENT / INDIVIDUAL</td></tr>
      <tr><th>Status</th><td>Account Closed</td></tr>
      <tr><th>Opened Date</th><td>Sep 03, 2011</td></tr>
      <tr><th>Reported Date</th><td>Oct 31, 2013</td></tr>
    </table>
  </body>
</html>
`;

export const equifaxHtmlFixture = `
<html>
  <body>
    <h1>Equifax Canada</h1>
    <p>Credit Report Request Date 2026/04/16</p>
    <h2>Accounts - Revolving</h2>
    <table>
      <tr><th>Member Name</th><td>CAPITAL ONE BANK</td></tr>
      <tr><th>Account Number</th><td>123456</td></tr>
      <tr><th>Status</th><td>Bad debt write-off</td></tr>
    </table>
  </body>
</html>
`;

export const equifaxTextFixture = `
Equifax Canada Co.
Credit ReportRequest Date 2026/04/16

Personal Information
Name TEST CONSUMER
Date of Birth 1961-01-30
Current Address
26 MAIN ST E
STEWIACKE NS B0N 2J0

Accounts - Revolving
CAPITAL ONE BANK
Account
Number
********1234
Phone
1-800-000-0000
Status
Revolving - Bad debt write-off
Balance And Amounts
Balance
$1,234.00
Credit Limit
$2,500.00
Past Due
$123.00
Account Dates
Opened
2020/01/15
Last Reported
2026/04/16
Payment Details
Payment Responsibility
Individual
Payment History

Collections
CBV COLLECTION SERVICES
Date Assigned 2024/02/10
Member Name ORIGINAL CREDITOR INC
Account Number ********8899
Amount $500.00
Balance $500.00
Status Unpaid
Date Verified 2026/04/16
`;

export const transUnionPortalLayoutFixture = `
Credit Report
TransUnion Canada
Report Date 2026-01-10
Consumer Information
DOB 1961-01-30
Name TEST CONSUMER
Address 26 MAIN ST E STEWIACKE NS B0N 2J0

Account Information
Creditor Name ROYAL BANK VISA
Account Number ********1111
Account Type REVOLVING / INDIVIDUAL
Balance $0.00
Status Open
Opened Date 2021-06-01
Reported Date 2026-01-10
`;

export const transUnionLegacyDisclosureFixture = `
TRANSUNION CANADA CONSUMER DISCLOSURE
TU Case ID: L999888
Last reviewed on Monday 10 January 2026

Personal Information:
Consumer Name: SAMPLE CONSUMER
Date of Birth: 1961-01-30
Current Address: 101 TEST AVE HALIFAX NS B3J 1A1

7. REVOLVING CREDIT
Creditor Name SAMPLE BANK VISA
Account Number ********1111
Account Type REVOLVING / INDIVIDUAL
Balance $2,345.67
Status Open
Opened Date 2020-01-15
Reported Date 2026-01-10
Payment History
Jan 2026 2345 100 0 R1 100 5000 0 0 AC /
`;

export const transUnionCollapsedSyntheticFixture = `
TransUnion Canada Consumer Disclosure
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

export const equifaxInstallmentTextFixture = `
Equifax Canada Co.
Credit ReportRequest Date 2026/04/16

Personal Information
Name SAMPLE CONSUMER
Date of Birth 1961-01-30
Current Address
101 TEST AVE
HALIFAX NS B3J 1A1

Accounts - Installment
SAMPLE AUTO FINANCE
Account
Number
********2222
Status
Installment - Pays as agreed
Balance And Amounts
Balance
$12,345.00
Highest Balance
$20,000.00
Past Due
$0.00
Account Dates
Opened
2022/06/15
Last Reported
2026/04/16
Payment Responsibility
Individual
`;

export const equifaxAccountOnlyTextFixture = `
Equifax Canada Co.
Credit ReportRequest Date 2026/04/16

Accounts - Open
SAMPLE TELCO
Account
Number
********3333
Status
Open - Too new to rate
Balance And Amounts
Balance
$89.10
Credit Limit
$0.00
Account Dates
Opened
2025/12/01
Last Reported
2026/04/16
`;

export const transUnionRegionalDisclosureTextFixture = `
TRANSUNION CANADA CONSUMER DISCLOSURE
Your file as of Feb 05, 2026
TU Case ID: AB-2026-77

Personal Information:
Consumer Name: ALEX TESTER
Birth Date Feb 05, 1982

Address(es):
55 SAMPLE RD
MONCTON NB E1C 1A1

4. INSTALLMENT LOANS
Creditor Name PRAIRIE AUTO CREDIT
Account Number ********4455
Account Type INSTALLMENT / INDIVIDUAL
Balance $8,765.00
Status Account Closed
Opened Date May 14, 2018
Reported Date Feb 05, 2026
Last Payment Date Jan 20, 2026
Payment History
Feb 2026 8765 325 0 I1 325 16000 0 0 AC /
`;

export const transUnionPortalTwoAccountTextOrderFixture = `
Credit Report
TransUnion Canada
Report Date 2026-02-05
TU Case ID PORT-2026-445
Consumer Information
Name ALEX TESTER
DOB 1982-02-05
Current Address 55 SAMPLE RD MONCTON NB E1C 1A1

Account Information
Creditor Name COASTAL CREDIT CARD
Account Number ********9911
Account Type REVOLVING / INDIVIDUAL
Status Open
Opened Date 2020-04-02
Reported Date 2026-02-05
Balance $410.25
Payment History
Feb 2026 410 35 0 R1 35 900 1500 0 0 AC /

Account Information
Creditor Name ATLANTIC AUTO LOAN
Account Number ********8844
Account Type INSTALLMENT / INDIVIDUAL
Status Open
Opened Date 2021-09-10
Reported Date 2026-02-05
Balance $9,900.00
High Credit $18,500.00
Payment History
Feb 2026 9900 410 0 I1 410 18500 0 0 AC /
`;

export const equifaxMortgageTextFixture = `
Equifax Canada Co.
Credit ReportRequest Date 2026/05/02

Personal Information
Name ALEX TESTER
Date of Birth 1982-02-05
Current Address
55 SAMPLE RD
MONCTON NB E1C 1A1

Accounts - Mortgage
SAMPLE TRUST MORTGAGE
Account
Number
********7788
Status
Mortgage - Pays as agreed
Balance And Amounts
Balance
$245,000.00
Highest Balance
$250,000.00
Past Due
$0.00
Account Dates
Opened
2019/08/01
Last Reported
2026/05/02
Payment Details
Payment Responsibility
Individual
`;

export const equifaxCollapsedCollectionsTextFixture = `
Equifax Canada Co.
Credit ReportRequest Date 2026/05/02

Personal Information
Name ALEX TESTER
Date of Birth 1982-02-05
Current Address
55 SAMPLE RD
MONCTON NB E1C 1A1

Collections
EASTERN COLLECTIONS INC Date Assigned2024/07/15 Member NameORIGINAL STORE LTD Phone Number Member NumberEC123 Account Number***902 Amount$721 Balance$721 StatusUnpaid Date Verified2026/05/02 Last Payment Date2022/12/01
NORTHERN RECOVERY SERVICES Date Assigned2025/01/10 Member NameSAMPLE TELCO Phone Number Member NumberNR777 First Delinquency2023/05/06 Account Number***903 Amount$312 Balance$300 StatusPaid Date Verified2026/05/02 Last Payment Date2023/05/06
`;

export const scannedImageOnlyPdfBase64Fixture =
  "JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9SZXNvdXJjZXMgPDwvWE9iamVjdCA8PC9JbTEgNCAwIFI+Pj4+IC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyA1IDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L1R5cGUgL1hPYmplY3QgL1N1YnR5cGUgL0ltYWdlIC9XaWR0aCAxIC9IZWlnaHQgMSAvQ29sb3JTcGFjZSAvRGV2aWNlUkdCIC9CaXRzUGVyQ29tcG9uZW50IDggL0xlbmd0aCAzPj4Kc3RyZWFtCv///wplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDM1Pj4Kc3RyZWFtCnEKNjEyIDAgMCA3OTIgMCAwIGNtCi9JbTEgRG8KUQplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDI2OSAwMDAwMCBuIAowMDAwMDAwNDMwIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2IC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjUxNQolJUVPRgo=";

export const ocrDerivedTransUnionTextFixture = `
TransUnion Canada Consumer Disclosure
Your file as of Mar 03, 2026
TU Case ID OCR-2026-01

Personal Information:
Consumer Name: OCR TESTER
Birth Date Mar 03, 1980

Address(es):
77 SCAN ST
HALIFAX NS B3J 2K9

\f
Account(s):
Creditor Name SCAN BANK VISA
Account Number ********7001
Account Type REVOLVING / INDIVIDUAL
Status Open
Opened Date Mar 01, 2020
Reported Date Mar 03, 2026
Balance $321.00
Payment History
Mar 2026 321 25 0 R1 25 800 1000 0 0 AC /
`;
