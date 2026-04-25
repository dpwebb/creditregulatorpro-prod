/**
 * Knowledge Base PDF Content Sections 7–12
 * Sections: Identity Theft, Bankruptcy, Compliance, Obligations, Bureaus & Creditors, Analytics
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

export const section7 = (): Content[] => [
  sectionHeader(7, "Identity Theft"),
  subHeader("5-Step Mitigation Flow"),
  body("When identity theft is detected, follow the strict 5-step mitigation flow:"),
  numberedList([
    "Deploy immediate Security Freeze across Equifax and TransUnion.",
    "Upload Official Police Report into Evidence Management.",
    "Initiate Identity Theft Packets to block fraudulent tradelines.",
    "Monitor change detection for new unauthorized inquiries."
  ]),

  subHeader("Fraud Freeze Management"),
  body("Credit Regulator Pro tracks 3 types of protection:"),
  bulletList([
    "Fraud Alert: Temporary 1-year protection requiring creditor verification.",
    "Extended Fraud Alert: 7-year protection, requiring a police report.",
    "Security Freeze: Complete lock down of the credit file."
  ]),

  subHeader("Thaw Requests & Documentation"),
  body("Temporary (duration-based) vs. Permanent thaw requests can be managed. Required document management includes Police Reports, Sworn Affidavits, and Identity Documents. The system provides monitoring & alerts for no-protection warnings, expiration tracking, and visual timeline views.")
];

export const section8 = (): Content[] => [
  sectionHeader(8, "Bankruptcy"),
  subHeader("4-Step Bankruptcy Management Flow"),
  numberedList([
    "Create Insolvency Record in the tracking dashboard.",
    "Link all applicable tradelines to the record.",
    "Verify the 'Zero Balance Rule' across all linked accounts.",
    "Deploy Discharge Violation targeted disputes for non-compliant furnishers."
  ]),

  subHeader("Record Creation Requirements"),
  body("To establish an insolvency record, 5 items are required:"),
  bulletList([
    "Filing Date",
    "Discharge/Completion Date",
    "Jurisdiction / Province",
    "Case Number",
    "Trustee Information"
  ]),

  subHeader("Insolvency Types"),
  bulletList([
    "Personal Bankruptcy",
    "Division I Proposals",
    "Consumer Proposals"
  ]),

  subHeader("Tradeline Linking & Discharge Violations"),
  body("The Zero Balance Rule mandates that any debt included in a discharged bankruptcy must report a $0 balance. The auto-scanner cross-references linked tradelines. If a balance > $0 is detected, the system generates a Bankruptcy Discharge Violation, triggering a targeted dispute vector to demand immediate deletion.")
];

export const section9 = (): Content[] => [
  sectionHeader(9, "Compliance"),
  subHeader("35 Detection Modules"),
  body("The core engine analyzes every tradeline using 35 specialized modules. These evaluate everything from temporal logic to substantive legal compliance:"),
  ...MODULES_DATA.map((mod, i) => createNumberedModule(i + 1, mod.title, mod.desc, mod.sev)),

  subHeader("Metro2 Validation System"),
  body("Includes version-aware Metro2 validation (2024/2025). The system analyzes:"),
  bulletList([
    "Base Segment Completeness.",
    "J1/J2 Segment (Co-maker) validity.",
    "Date Logic (ensuring chronological sanity).",
    "Status-Balance Coherence."
  ]),

  subHeader("Collection Agent Rules & Limitations"),
  createTable(
    ["Region", "Limitation Period"],
    [
      ["ON, BC, AB, SK", "2 Years"],
      ["QC", "3 Years"],
      ["MB, NS, NB, PE, NL, YT, NT, NU", "6 Years"]
    ]
  ),

  subHeader("Key Enforcement Rules & Persistence"),
  body("Key enforcement rules include the Validation Requirement, Pre-reporting Notice, Identity Disclosure, and Dispute Status Marking. Scan execution results in persisted logs containing:"),
  bulletList([
    "Confidence Scores (0-100).",
    "User Explanations.",
    "Recommended Actions.",
    "Statutory Basis citations."
  ]),

  subHeader("Compliance Calendar & Timeframes"),
  body("The calendar visualizes regulatory events, packet events, and response deadlines. Color coding is strictly enforced: Red (Overdue), Orange (Due Soon), Green (Completed). Statutory timeframes are rigid: PIPEDA 30d, Ontario CRA 30 business days, BC PIPA 30 business days, Quebec 30d strict."),

  subHeader("4-Phase Dispute Cycle & Auto-Escalation"),
  body("Missed deadlines trigger the auto-escalation system. Disputes progress through 4 phases. The escalation flow is:"),
  createInfoBox("ESCALATION FLOW", "AUTHORITY_TO_REPORT → VERIFICATION_METHOD → COMPLETENESS_ATTESTATION → ACCURACY_ATTESTATION → TIMING_COMPLIANCE"),
  body("Each tradeline cycles through Warning, Breach, and Escalation phases. Indicators boldly show COMPLIANT, AT RISK, or BREACH DETECTED."),

  subHeader("Regulatory Updates Process"),
  body("The legal landscape is monitored. Updates go through 4 steps: Detection, Review, Application, and User Notification.")
];

export const section10 = (): Content[] => [
  sectionHeader(10, "Obligations"),
  subHeader("7 Adversarial Dispute Vectors"),
  body("Credit Regulator Pro uses 7 highly specific legal vectors to challenge accounts. Each has a strict statutory basis:"),
  numberedList([
    "AUTHORITY_TO_REPORT: Demonstrate statutory authority to report this account. (Basis: Data Furnisher Agreement)",
    "PERMISSIBLE_PURPOSE: Provide documentation of permissible purpose. (Basis: PIPEDA s.7 / Provincial CRA)",
    "VERIFICATION_METHOD: Disclose specific method used to verify disputed information. (Basis: Provincial CRA MOV disclosure)",
    "COMPLETENESS_ATTESTATION: Attest to completeness of data elements reported. (Basis: Provincial CRA completeness requirement)",
    "ACCURACY_ATTESTATION: Provide procedural basis for accuracy claim. (Basis: Provincial CRA maximum possible accuracy)",
    "TIMING_COMPLIANCE: Document compliance with statutory notice requirements. (Basis: Provincial CRA statutory investigation timeline)",
    "INVESTIGATION_PROCEDURE: Detail investigation procedure and findings. (Basis: Provincial CRA reinvestigation obligation)"
  ]),

  subHeader("Auto-Request Workflow & Rotation Strategy"),
  body("The workflow sequence is: Detect → Map → Track → Score. For a time-barred debt, it maps to Vector 1, tracks the 30-day response, and scores the pressure. The 4-Phase Rotation Strategy ensures relentless pressure:"),
  bulletList([
    "Phase 1: Foundational Challenge (AUTHORITY_TO_REPORT + PERMISSIBLE_PURPOSE).",
    "Phase 2: Methodological Challenge (VERIFICATION_METHOD + COMPLETENESS_ATTESTATION).",
    "Phase 3: Substantive Procedural Challenge (ACCURACY_ATTESTATION + INVESTIGATION_PROCEDURE).",
    "Phase 4: Procedural Exhaustion (TIMING_COMPLIANCE)."
  ]),

  subHeader("Response Deficiency Detection"),
  body("Incoming mail is scanned for 3 patterns: Lack of specificity, missing documentation, and absent attestation signatures."),

  subHeader("Obligation Lifecycle & Types"),
  body("Obligations progress through 5 states: OBLIGATION_PENDING → CHALLENGED → NO_RESPONSE → INSUFFICIENT_RESPONSE → PROCEDURALLY_EXHAUSTED. Types include Creditor, Bureau, and Collector. Collector obligations have 5 sub-duties including proper licensing and fee authorization."),

  subHeader("Enforcement & Metrics"),
  body("Enforcement mechanisms include complaint procedures, enforcing bodies, and penalties. The success metrics evaluated are DELETED, CORRECTED, REMOVED, and UPDATED.")
];

export const section11 = (): Content[] => [
  sectionHeader(11, "Bureaus & Creditors"),
  subHeader("Bureau Management"),
  body("Manage Equifax and TransUnion profiles and investigate responses. Official dispute contact addresses:"),
  bulletList([
    "Equifax: Consumer Relations, Box 190 Jean Talon Station, Montreal QC H1S 2Z2",
    "TransUnion: Consumer Relations Centre, 3115 Harvester Road Suite 201, Burlington ON L7N 3N8"
  ]),

  subHeader("Creditor Management & Validation Workflow"),
  body("Creditor validation encompasses 4 critical steps:"),
  numberedList([
    "Trigger Analysis: Searching the database for specific compliance breaks.",
    "Vector Selection: Picking the optimal dispute strategy.",
    "Deadline Calculation: Setting the strict timeline based on jurisdiction.",
    "Deficiency Detection: Analyzing the eventual response."
  ]),
  body("Response quality analysis scrutinizes 4 items: Specificity, Documentation provided, Attestation, and Timing.")
];

export const section12 = (): Content[] => [
  sectionHeader(12, "Analytics"),
  subHeader("Success Outcomes"),
  body("The system calculates success via the formula: (Total Deletions + Corrections + Removals + Updates) / Total Active Challenges. The 4 outcome classifications are:"),
  bulletList([
    "DELETED: Account completely removed from credit report.",
    "CORRECTED: Error corrected (balance, status, dates, etc.).",
    "REMOVED: Negative information removed while account remains.",
    "UPDATED: Reporting updated to accurate status."
  ]),

  subHeader("Pressure Score"),
  body("Proprietary index (0-100) indicating legal pressure on a furnisher. Formula components:"),
  bulletList([
    "+10 points for unanswered challenges.",
    "+5 for WARNINGs / +15 for ERRORs in Metro2.",
    "+2 points per month since Phase 4 is reached.",
    "+20 points for active regulatory complaints."
  ]),
  body("Interpretation: 0-30 Low, 31-60 Moderate, 61-80 High, 81-100 Critical."),

  subHeader("Analytics Dimensions & Reporting"),
  body("Success rates are sliced across 4 dimensions: by vector, by creditor, by bureau, and by violation category. The dashboard tracks Success Rate, Average Response Time, Pressure Score, and Phase 4 Exhaustion Rate. Vector rotation analytics and robust audit reporting power the enterprise-grade insight engine.")
];