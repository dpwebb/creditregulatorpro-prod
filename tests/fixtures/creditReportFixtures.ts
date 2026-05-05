export const transUnionTextFixture = `
TransUnion Canada Consumer Disclosure
Your file as of Jan 10, 2026

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
