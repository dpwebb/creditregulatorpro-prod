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
