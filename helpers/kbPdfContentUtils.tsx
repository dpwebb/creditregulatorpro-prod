/**
 * Shared utility functions and data for Knowledge Base PDF content sections.
 * Used by kbPdfContentSections1, kbPdfContentSections2, kbPdfContentSections3,
 * and the main kbPdfContentSections assembler.
 */

type Content = any;

export const createWarningBox = (title: string, text: string): Content => ({
  table: {
    widths: ["*"],
    body: [
      [
        {
          stack: [
            { text: title, bold: true, margin: [0, 0, 0, 5] },
            { text: text, style: "body", margin: [0, 0, 0, 0] }
          ],
          fillColor: "#fff3cd",
          color: "#856404",
          margin: [10, 10, 10, 10],
          border: [true, true, true, true]
        }
      ]
    ]
  },
  layout: "lightHorizontalLines",
  margin: [0, 10, 0, 10]
});

export const createInfoBox = (title: string, text: string): Content => ({
  table: {
    widths: ["*"],
    body: [
      [
        {
          stack: [
            { text: title, bold: true, margin: [0, 0, 0, 5] },
            { text: text, style: "body", margin: [0, 0, 0, 0] }
          ],
          fillColor: "#cce5ff",
          color: "#004085",
          margin: [10, 10, 10, 10],
          border: [true, true, true, true]
        }
      ]
    ]
  },
  layout: "lightHorizontalLines",
  margin: [0, 10, 0, 10]
});

export const createCriticalBox = (title: string, text: string): Content => ({
  table: {
    widths: ["*"],
    body: [
      [
        {
          stack: [
            { text: title, bold: true, margin: [0, 0, 0, 5] },
            { text: text, style: "body", margin: [0, 0, 0, 0] }
          ],
          fillColor: "#f8d7da",
          color: "#721c24",
          margin: [10, 10, 10, 10],
          border: [true, true, true, true]
        }
      ]
    ]
  },
  layout: "lightHorizontalLines",
  margin: [0, 10, 0, 10]
});

export const createNumberedModule = (num: number, title: string, description: string, severity: string): Content => ({
  table: {
    widths: ["*"],
    body: [
      [
        {
          stack: [
            {
              columns: [
                { text: `${num}. ${title}`, bold: true, fontSize: 12, width: "*" },
                {
                  text: severity,
                  bold: true,
                  fontSize: 10,
                  color: severity === "ERROR" ? "#d32f2f" : "#ed6c02",
                  alignment: "right",
                  width: 60
                }
              ]
            },
            { text: description, fontSize: 11, color: "#333333", margin: [0, 5, 0, 0] }
          ],
          fillColor: "#fcfcfc",
          margin: [10, 10, 10, 10],
          border: [true, true, true, true]
        }
      ]
    ]
  },
  layout: {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => "#e0e0e0",
    vLineColor: () => "#e0e0e0"
  },
  margin: [0, 5, 0, 5]
});

export const sectionHeader = (num: number, title: string): Content => ({
  text: `${num}. ${title}`,
  style: "header",
  tocItem: true,
  pageBreak: "before"
});

export const subHeader = (text: string): Content => ({ text, style: "subHeader" });
export const h3 = (text: string): Content => ({ text, style: "h3" });
export const body = (text: string | any[]): Content => ({ text, style: "body" });
export const bulletList = (items: any[]): Content => ({ ul: items, style: "list" });
export const numberedList = (items: any[]): Content => ({ ol: items, style: "list" });
export const createTable = (headers: string[], rows: any[][], widths?: string[]): Content => ({
  table: {
    headerRows: 1,
    widths: widths || headers.map(() => "*"),
    body: [
      headers.map((h) => ({ text: h, style: "tableHeader" })),
      ...rows.map((row) => row.map((cell) => ({ text: cell, style: "tableCell" })))
    ]
  },
  style: "tableExample"
});

export const MODULES_DATA = [
  { title: "Temporal Manipulation", desc: "Identifies retroactive manipulation of account history dates.", sev: "ERROR" },
  { title: "Cross-Entity Discrepancies", desc: "Detects conflicting data points across different reporting entities.", sev: "WARNING" },
  { title: "Statute of Limitations", desc: "Flags accounts being reported or collected beyond provincial limits.", sev: "ERROR" },
  { title: "Payment History Manipulation", desc: "Identifies impossible or unsupported payment pattern updates.", sev: "ERROR" },
  { title: "Balance Calculation Errors", desc: "Detects mathematically impossible balance reporting based on credit limits and payments.", sev: "ERROR" },
  { title: "Documentation Chain Failures", desc: "Identifies missing or broken chains of title for purchased debt.", sev: "ERROR" },
  { title: "Procedural Timing Findings", desc: "Flags missed statutory investigation response timeframes.", sev: "ERROR" },
  { title: "Multiple Collector Findings", desc: "Detects multiple agencies reporting or collecting on the same debt simultaneously.", sev: "WARNING" },
  { title: "Credit Limit Manipulation", desc: "Identifies artificial lowering of credit limits to manufacture high utilization.", sev: "WARNING" },
  { title: "Bankruptcy Discharge Findings", desc: "Flags attempts to collect or report balances on debts discharged in bankruptcy.", sev: "ERROR" },
  { title: "Identity Theft Indicators", desc: "Highlights reporting patterns consistent with unverified identity theft.", sev: "ERROR" },
  { title: "Account Status Inconsistencies", desc: "Detects conflicts between account status codes and actual reporting behavior.", sev: "WARNING" },
  { title: "Response Quality Analysis", desc: "Analyzes bureau/creditor responses for required substantive evidence.", sev: "WARNING" },
  { title: "Cross-Bureau Inconsistencies", desc: "Flags significant drift or contradictory data across Equifax and TransUnion.", sev: "WARNING" },
  { title: "Metro2 Field Completeness", desc: "Ensures all required base segments are present according to industry standards.", sev: "ERROR" },
  { title: "Metro2 Ruleset Findings", desc: "Detects structural reporting-standard issues in the Metro2 reporting format.", sev: "ERROR" },
  { title: "Debt Validation Failure", desc: "Identifies failure to provide adequate debt validation upon request.", sev: "ERROR" },
  { title: "Original Creditor Chain Failure", desc: "Flags inability to trace debt back to the original creditor.", sev: "ERROR" },
  { title: "Time-Barred Debt Collection", desc: "Detects collection attempts that appear stale under provincial limitation windows.", sev: "ERROR" },
  { title: "Response Audit Suite", desc: "Evaluates incoming responses against 35 distinct quality criteria.", sev: "WARNING" },
  { title: "Bureau Investigation Failure", desc: "Flags bureaus that fail to conduct a reasonable investigation.", sev: "ERROR" },
  { title: "Bureau Notification Failure", desc: "Detects when bureaus fail to notify furnishers of a dispute.", sev: "ERROR" },
  { title: "Bureau Reinsertion Violation", desc: "Identifies previously deleted accounts reinserted without required notice.", sev: "ERROR" },
  { title: "Bureau Access Violation", desc: "Flags impermissible access to consumer credit files.", sev: "ERROR" },
  { title: "Bureau Dispute Marking Failure", desc: "Detects failure to mark accounts as 'disputed by consumer'.", sev: "WARNING" },
  { title: "Furnisher Re-aging Violation", desc: "Identifies unsupported changes to the Date of First Delinquency (DOFD).", sev: "ERROR" },
  { title: "Furnisher Status Code Mismatch", desc: "Flags incorrect ECOA or status code application.", sev: "WARNING" },
  { title: "Furnisher Joint Account Violation", desc: "Detects improper reporting of joint or co-signed accounts.", sev: "WARNING" },
  { title: "Furnisher Authorized User Misrepresentation", desc: "Identifies failure to properly distinguish authorized users from primary account holders.", sev: "ERROR" },
  { title: "Furnisher Post-Dispute Retaliation", desc: "Flags punitive reporting actions taken immediately after a dispute.", sev: "ERROR" },
  { title: "Collector License Failure", desc: "Detects collection activity by unlicensed entities in restricted provinces.", sev: "ERROR" },
  { title: "Collector Unauthorized Fees", desc: "Identifies added collection fees or interest not supported by the available account record.", sev: "ERROR" },
  { title: "Collector Payment Acknowledgment Violation", desc: "Flags failure to properly credit or acknowledge payments.", sev: "ERROR" },
  { title: "Collector Duplicate Reporting", desc: "Detects the same debt reported multiple times under different account numbers.", sev: "ERROR" },
  { title: "Collector Statute Revival Attempt", desc: "Identifies attempts that may improperly restart a limitation period based on the available record.", sev: "ERROR" }
];
