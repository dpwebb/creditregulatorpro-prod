/**
 * Knowledge Base PDF Content Sections 1–6
 * Sections: Getting Started, Upload & Reports, Tradelines, Evidence, Packets, Human Rights
 */

type Content = any;

import {
  createWarningBox,
  createInfoBox,
  createCriticalBox,
  createNumberedModule,
  sectionHeader,
  subHeader,
  body,
  bulletList,
  numberedList,
  createTable,
  MODULES_DATA,
} from "./kbPdfContentUtils";

export const section1 = (): Content[] => [
  sectionHeader(1, "Getting Started"),
  subHeader("Welcome to Credit Regulator Pro: Hostile Credit Bureau Audit Engine"),
  body("Welcome to Credit Regulator Pro, a Canadian credit-report review and challenge platform. The system helps users review supported Canadian reports, document possible compliance findings, and prepare evidence-based requests without admitting debt validity."),
  body("The system uses PIPEDA, provincial Consumer Reporting Acts, reporting standards, and local authority mappings to help challenge unsupported derogatory tradelines. The compliance scanner detects credit reporting issues and authority-mapped findings for user review."),

  subHeader("Compliance Finding Scanner"),
  body("Credit Regulator Pro automatically scans every tradeline using supported detection areas, authority-backed finding categories, and runtime rules. Detected findings are logged with confidence scores, user-friendly explanations, and recommended actions for review. This list summarizes the core detection areas:"),
  ...MODULES_DATA.map((mod, i) => createNumberedModule(i + 1, mod.title, mod.desc, mod.sev)),

  subHeader("Canadian Policy Enforcement"),
  createCriticalBox(
    "CRITICAL ENFORCEMENT RULES",
    "These non-negotiable rules are strictly enforced at the system level to ensure compliance and sovereignty. Violating these principles is a breach of system architecture."
  ),
  bulletList([
    { text: ["Region Lock: Canada Only.", " All data storage and processing is strictly limited to Canadian regions. Cross-border transfer is blocked. The AWS environment is rigidly set to ca-central-1. US Bureau rejection is built into the ingestion engine."] },
    { text: ["Data Retention: 1 Year.", " Evidence and personal data are scheduled for retention for up to 1 year from the date of creation or last action. Export needed packets before expiration and verify purge jobs are running as expected."] },
    { text: ["Terminal Label Progression:", " Disputes must follow the strict 4-phase progression. You cannot circumvent phases. Phase 4 (Procedural Exhaustion) is the final phase of the dispute cycle."] }
  ]),

  subHeader("Dashboard Tour"),
  body("The central dashboard provides a high-level overview of your audit operations, categorized into four critical metrics:"),
  bulletList([
    "Compliance Findings: Displays the real-time count of active authority-mapped findings detected across your tradelines.",
    "Active Challenges: Shows the number of obligations currently in the OBLIGATION_PENDING or CHALLENGED states, awaiting creditor or bureau response.",
    "Procedural Exhaustion: Highlights tradelines that have reached Phase 4 of the dispute cycle, making them candidates for regulatory complaints or outside legal review.",
    "Success Metrics: Aggregates outcomes showing the counts of DELETED, CORRECTED, REMOVED, and UPDATED items, driving your global success rate."
  ]),

  subHeader("Quick Start Checklist"),
  numberedList([
    "Complete Your Profile: Ensure your full legal name, Canadian address, date of birth, and identity documentation are fully uploaded and verified.",
    "Deploy Initial Audit Scan (Upload Report): Ingest your Equifax or TransUnion credit report using the secure upload pipeline.",
    "Review Compliance Findings: Evaluate the Infraction Findings Panel to see which supported finding categories triggered an ERROR or WARNING.",
    "Generate Adversarial Packets: Initiate the rotation strategy by launching Phase 1 (Foundational Challenge) packets to target AUTHORITY_TO_REPORT."
  ])
];

export const section2 = (): Content[] => [
  sectionHeader(2, "Upload & Reports"),
  subHeader("Upload Process Flow"),
  body("The upload process ingests credit reports via direct processing, strictly enforcing the Canadian region policy. The flow is standardized into 5 rigorous steps:"),
  numberedList([
    "File Selection: User uploads a compliant PDF credit report.",
    "Security Validation: The system checks for payload maliciousness and enforces the ca-central-1 region lock.",
    "Base64 Encoding: The file is converted and prepared for the OCR pipeline.",
    "Direct Ingestion: The backend handles user identification via authenticated session and processes the stream.",
    "Database Persistence: Extracted data is saved and mapped to Report Artifacts."
  ]),

  subHeader("OCR Extraction Pipeline"),
  body("The Optical Character Recognition (OCR) pipeline is highly tuned for Equifax and TransUnion Canadian report formats. The extraction engine targets specific data clusters:"),
  bulletList([
    "Consumer Info: Names, DOB, addresses, and employment history.",
    "Tradelines: Complete account histories, balances, high credits, dates of first delinquency, and status codes.",
    "Public Records: Bankruptcies, judgments, and consumer proposals.",
    "Inquiries: Hard and soft pulls, promotional inquiries, and account reviews."
  ]),
  body("Handling OCR Errors: If extraction fails or confidence is below threshold, the system prompts for manual correction in OCR Review Mode. It adjusts confidence scores dynamically and falls back to secondary parsing logic if primary patterns fail."),

  subHeader("Review Workflow"),
  body("Extracted data goes through two distinct review modes before being finalized in the system:"),
  bulletList([
    "OCR Review Mode: Receives location state with the review session ID. It prompts human validation for field-by-field approval and correcting errors before generating tradelines.",
    "Artifact Review Mode: Loads the saved artifact by ID and runs the regulation infraction scanner. It populates the Infraction Findings Panel with detected FCRA/provincial violations and presents actionable workflow buttons."
  ]),

  subHeader("Change Detection / Drift System"),
  body("The Change Detection system monitors for drift across snapshots, identifying discrepancies between expected and actual data in credit reports. It tracks variations over time without explicit notification from the bureau:"),
  bulletList([
    "Balance Inflation: Detects mathematically impossible increases in debt balances, especially on closed accounts.",
    "DOFD Changes: Flags Date of First Delinquency changes that may indicate unsupported re-aging.",
    "Status Alterations: Monitors for sudden shifts in account status codes (e.g., from 11 to 97).",
    "Removed/Re-inserted Accounts: Tracks unverifiable debt records that disappear and reappear, triggering reinserted-item review."
  ]),

  subHeader("Report Artifact Management"),
  createWarningBox("1-YEAR RETENTION TARGET", "Report artifacts are scheduled for retention for up to one year from their creation date."),
  body("Report Artifacts represent the snapshots of uploaded reports. You can perform inline editing for artifact types and dates. The interface displays expiration statuses with badges and shows 'Not Linked' for artifacts without associated tradelines. Once the 1-year mark is hit, the blob and corresponding rows are irreversibly purged.")
];

export const section3 = (): Content[] => [
  sectionHeader(3, "Tradelines"),
  subHeader("Definition & Data Model"),
  body("Tradelines represent individual accounts on a credit report. They form the foundational data entity in Credit Regulator Pro, linked to obligations, packets, and evidence events. The model captures balances, payment histories, account designations, and specific industry codes."),

  subHeader("Compliance Finding Scanning"),
  body("Every tradeline is subjected to the Compliance Finding Scanner (see Section 9 for full details). This integration checks available data against statutory limits, mapped authority references, and reporting standards."),

  subHeader("Metro2 Validation Rules"),
  body("Credit Regulator Pro validates tradelines against version-aware Metro2 standards. Key validations include:"),
  bulletList([
    "Base Segment Completeness: Ensures all required consumer and account fields are populated.",
    "Date Logic: Validates that the Date Opened precedes the Last Activity Date and DOFD.",
    "Balance Calculations: Confirms Current Balance <= High Credit.",
    "Status-Balance Coherence: Ensures zero balances on accounts marked as included in bankruptcy.",
    "J1/J2 Segment Presence: Checks for co-maker and joint account structural integrity.",
    "Payment History Profile: Verifies the 24-month grid matches the status code."
  ]),

  subHeader("Account Number Formats & Status Codes"),
  body("Account numbers are parsed when reported and often partially masked. Some bureau reports omit them, so account identity also uses creditor, bureau, dates, account type, and balance data. Key Canadian status codes are strictly monitored:"),
  bulletList([
    "11: Current / Paid as agreed.",
    "71: 30 Days Past Due.",
    "97: Unpaid Balance / Bad Debt / Collection.",
    "DA: Delete Account."
  ]),

  subHeader("Drift Detection & Re-aging"),
  body("Drift detection spots unnotified changes. A prime example is 'Re-aging', where a furnisher appears to advance the DOFD in a way that could keep a derogatory tradeline on the report longer than the available source evidence supports. The system flags this for review as a 'Furnisher Re-aging Violation'."),

  subHeader("Compliance Hub Features"),
  body("The tradeline detail page acts as a Compliance Hub. It aggregates:"),
  bulletList([
    "Violation Summary: A comprehensive list of infractions.",
    "Dispute Status: Reset state for the retired dispute generation flow.",
    "Confidence Scores: 0-100 system certainty metric.",
    "Technical Details & Authority Basis: Deep-dive logs into the source evidence and mapped authority reference.",
    "Action Buttons: Reset notices or historical packet review actions."
  ]),

  subHeader("Managing Tradelines"),
  body("Tradelines can be managed in two ways:"),
  numberedList([
    "Importing from Reports (5-step process): Upload -> Parse -> OCR Review -> Scan -> Persist.",
    "Creating Manually: Users can manually add a tradeline by filling out the details shown on the report. Account number is included only when the bureau reports one."
  ]),

  subHeader("Creditor Validation Workflow"),
  body("This internal workflow governs the lifecycle of a creditor challenge:"),
  bulletList([
    "analyzeTradelineForTriggers: Uses trigger mapping logic to find compliance faults.",
    "selectNextVector: Enforces rotation rules (e.g., Phase 1 to Phase 2).",
    "calculateResponseDeadline: Uses jurisdiction rules to set exact deadlines (e.g., 30 business days).",
    "detectResponseDeficiencies: Scans incoming mail for 3 pattern categories (specificity, documentation, attestation)."
  ])
];

export const section4 = (): Content[] => [
  sectionHeader(4, "Evidence"),
  subHeader("SHA-256 Hash Chain Mechanism"),
  body("Credit Regulator Pro secures evidence using a cryptographic hash chain. This ensures total immutability and legal admissibility in Canadian courts. Every evidence event computes a new hash using the following strict formula:"),
  createInfoBox("HASH ALGORITHM", "newHash = SHA256(previousHash + currentPayload)"),
  body("The Genesis Block acts as the root of the chain for a given tradeline or packet lifecycle. Verification follows a 4-step process:"),
  numberedList([
    "Retrieve Genesis Hash.",
    "Iterate through the chronological log of events.",
    "Recompute the SHA-256 string for each payload.",
    "Match the final computed hash against the stored currentHash."
  ]),

  subHeader("Evidence Management & Bureau Upload"),
  body("Evidence management provides a centralized view of all files. Bureau communications uploaded into the system are automatically hash-chain linked. The system forces required context linking (attaching the evidence to an obligation or packet) and tracks the communication type."),
  createWarningBox("RATE LIMITING", "Evidence uploads are strictly rate-limited to 10 per hour to prevent abuse and system overload."),

  subHeader("Supported Evidence Types"),
  bulletList([
    "Bureau Credit Reports (PDFs)",
    "Creditor Validation Letters",
    "Postal Tracking Receipts",
    "Signed Affidavits",
    "Police Reports (Identity Theft)",
    "Identity Verification Documents (ID, Utility Bills)"
  ]),

  subHeader("Evidence Timeline"),
  body("The visual evidence timeline records:"),
  bulletList([
    "Event Timestamp",
    "Event Type (Upload, Packet Generation, Response Received)",
    "Actor (User ID / System)",
    "Cryptographic Hash Link",
    "Attached Documentation Context"
  ]),

  subHeader("Evidence Packaging (Court-Ready PDFs)"),
  body("When compiling an escalation to a regulatory body, Credit Regulator Pro generates a hash-verified evidence PDF containing 7 sections:"),
  numberedList([
    "Cover Letter & Affidavit of Truth",
    "Table of Contents",
    "Chronological Event Log",
    "Hash Verification Table",
    "Statutory Violations Summary",
    "Dispute Packet Copies",
    "Exhibits & Uploaded Evidence"
  ]),

  subHeader("Audit Logging & Retention"),
  body("Every action generates an immutable audit log across 4 event types: Authentication, CRUD Operations, Evidence Actions, and System Operations."),
  createCriticalBox("HARD RETENTION LIMIT", "All evidence strictly follows the 1-Year Retention Policy. Evidence older than 365 days is permanently destroyed to comply with data minimization requirements."),

  subHeader("Best Practices"),
  bulletList([
    "Ensure the entire page is visible, including headers/footers.",
    "Upload responses on the exact day they are received.",
    "Never alter or redact files before uploading (let the system handle parsing).",
    "Export needed evidence packages locally before the retention purge."
  ])
];

export const section5 = (): Content[] => [
  sectionHeader(5, "Packets"),
  subHeader("Dispute Packet Definition"),
  body("Packets are dispute letters automatically generated based on detected compliance findings. They incorporate mapped statutory citations and ask for review, verification, correction, or procedural compliance."),

  subHeader("Provincial Statutes Selection"),
  body("Credit Regulator Pro automatically selects the correct legislation based on the consumer's jurisdiction. Below is the complete table of applicable laws:"),
  createTable(
    ["Province / Territory", "Consumer Reporting Legislation"],
    [
      ["Ontario", "CRA R.S.O. 1990 c. C.33"],
      ["British Columbia", "CRA R.S.B.C. 1996 c. 69"],
      ["Alberta", "PIPA S.A. 2003 c. P-6.5"],
      ["Saskatchewan", "CPBPA S.S. 2014 c. C-30.2"],
      ["Quebec", "Credit Agents Act RLRQ c. A-8.2"],
      ["Manitoba", "CPA C.C.S.M. c. C200"],
      ["Nova Scotia", "CRA S.N.S. 2010 c. 13"],
      ["New Brunswick", "CRA S.N.B. 2009 c. C-24.3"],
      ["Prince Edward Island", "CRA R.S.P.E.I. 1988 c. C-26"],
      ["Newfoundland", "CPBPA S.N.L. 2009 c. C-31.1"],
      ["Yukon", "CPA R.S.Y. 2002 c. 40"],
      ["Northwest Territories", "CPA S.N.W.T. 2007 c. 11"],
      ["Nunavut", "CPA R.S.N.W.T. (Nu) 1988 c. C-17"]
    ]
  ),

  subHeader("Tracking Placeholder System"),
  body("The system inserts tracking placeholders serving 4 distinct purposes:"),
  bulletList([
    "Delivery tracking synchronization via Canada Post APIs.",
    "Deadline calculation initiation (starts the statutory clock).",
    "Evidence association (linking tracking barcodes to the packet ID).",
    "Statutory clock initiation."
  ]),

  subHeader("Phase Progression"),
  body("Disputes must strictly follow the 4-phase progression system:"),
  bulletList([
    "Phase 1: Foundational Challenge (Focus on Authority and Purpose).",
    "Phase 2: Methodological Challenge (Focus on Verification Methods).",
    "Phase 3: Substantive Challenge (Focus on Accuracy and Investigation).",
    "Phase 4: Procedural Exhaustion (Final Notice before litigation)."
  ]),
  createWarningBox("4-PHASE PROGRESSION", "Disputes in Credit Regulator Pro follow a strict 4-phase cycle. Phase 4 (Procedural Exhaustion) is the final phase of the dispute cycle."),

  subHeader("Step-by-Step Generation"),
  numberedList([
    "Select Tradeline and active Violation.",
    "System maps the jurisdiction and applicable statute.",
    "Select the Dispute Vector (based on Rotation Strategy).",
    "Review the AI-generated drafted content.",
    "Apply Digital Signature.",
    "Generate PDF and record hash."
  ])
];

export const section6 = (): Content[] => [
  sectionHeader(6, "Human Rights"),
  subHeader("Canadian Human Rights Act Overview"),
  body("This section covers human rights protections under Canadian law, specifically related to discrimination grounds and fair credit reporting practices. If a creditor's reporting pattern exhibits discriminatory behavior, Credit Regulator Pro tracks these claims."),

  subHeader("14 Protected Grounds"),
  bulletList([
    "Age", "Colour", "Conviction for which a pardon has been granted", "Disability",
    "Family Status", "Gender Identity or Expression", "Genetic Characteristics",
    "Marital Status", "National or Ethnic Origin", "Other", "Race",
    "Religion", "Sex", "Sexual Orientation"
  ]),

  subHeader("When to File"),
  body("A human rights escalation is warranted under 3 scenarios:"),
  numberedList([
    "A credit application is denied primarily based on a protected ground.",
    "A furnisher aggressively reports derogatory marks targeted at marginalized groups.",
    "A bureau refuses to investigate claims linked to an individual's demographic profile."
  ]),

  subHeader("How to Document"),
  numberedList([
    "Log the initial discrimination claim against the specific tradeline.",
    "Select the applicable grounds from the 14 options.",
    "Input a detailed chronological description of the event.",
    "Attach all associated communications (emails, denial letters).",
    "Finalize the Evidence Summary report."
  ]),

  subHeader("Status Tracking"),
  body("Claims flow through an immutable state machine: REPORTED → UNDER_REVIEW → ESCALATED → RESOLVED.")
];
