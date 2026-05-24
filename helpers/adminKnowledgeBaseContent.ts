export type AdminKbFeatureCategory = "Platform" | "Legal & Rules" | "Tools" | "Reference";

export type AdminKbFeatureGroup = {
  category: AdminKbFeatureCategory;
  title: string;
  route?: string;
  summary: string;
  functions: readonly string[];
};

export type PlatformFunctionGroup = {
  title: string;
  intro: string;
  items: readonly string[];
};

export const adminKbFeatureGroups: readonly AdminKbFeatureGroup[] = [
  {
    category: "Platform",
    title: "Home Dashboard",
    route: "/",
    summary: "Admin landing view for platform orientation, metrics, and navigation.",
    functions: [
      "Review dashboard status cards and recent platform activity.",
      "Use admin sidebar search, favorites, and recent items.",
      "Open the platform functions PDF from the sidebar.",
    ],
  },
  {
    category: "Platform",
    title: "User Management",
    route: "/admin-user-management",
    summary: "Admin account operations for users, support agents, and user data lifecycle support.",
    functions: [
      "Search, filter, and paginate user accounts by role or identity.",
      "Open user detail records and usage counts for reports, tradelines, packets, and evidence.",
      "Create support agent accounts for customer service workflows.",
      "Reset user data only when the workflow has been approved and the target account is correct.",
      "Delete user accounts only through the guarded admin action when policy allows it.",
    ],
  },
  {
    category: "Platform",
    title: "Compliance Risk Triage",
    route: "/admin-risk-triage",
    summary: "Review queue for active hidden-risk findings that need admin judgment.",
    functions: [
      "Search findings by ID, affected user, creditor, bureau, account, or category.",
      "Review severity, evidence details, and affected tradeline context.",
      "Open the linked correction workflow when source data, parser output, or rule evidence needs repair.",
      "Mark findings false positive when admin review confirms they should not remain active.",
    ],
  },
  {
    category: "Platform",
    title: "Rule Check Settings",
    route: "/admin-compliance-config",
    summary: "System controls for compliance detector thresholds, user-facing messages, pricing, and app mode.",
    functions: [
      "Enable or disable configured detector categories.",
      "Tune confidence thresholds for each detector category.",
      "Edit user explanation and recommended action templates.",
      "Configure postal delivery base costs and surcharge settings.",
      "Control production mode for paid-plan enforcement.",
    ],
  },
  {
    category: "Platform",
    title: "Activity Logs",
    route: "/admin-activity-logs",
    summary: "Audit review for successful and notable platform actions.",
    functions: [
      "Filter activity by date range, user, action type, and entity type.",
      "Review expanded audit payloads for operational investigations.",
      "Trace user and admin actions across uploads, packets, support activity, and configuration changes.",
    ],
  },
  {
    category: "Platform",
    title: "Error Logs",
    route: "/admin-error-logs",
    summary: "Failure-focused log review for production and staging diagnostics.",
    functions: [
      "Filter failed audit records by severity, action type, entity type, user, and date range.",
      "Hide duplicate fingerprints to identify unique failures faster.",
      "Expand error details for debugging without exposing secrets.",
    ],
  },
  {
    category: "Platform",
    title: "Security & Compliance",
    route: "/admin-security",
    summary: "Security, retention, and semantic audit operations for internal administrators.",
    functions: [
      "Review audit log records from the security view.",
      "Monitor and run data retention workflows for expired evidence and packets.",
      "Run semantic audit diagnostics to find wording, reference, and consistency issues.",
      "Review domain guard, anti-duplication, content protection, and watermarking posture.",
    ],
  },
  {
    category: "Platform",
    title: "Support Tickets",
    route: "/support-tickets",
    summary: "Admin and support queue for customer issue handling.",
    functions: [
      "View open, assigned, unassigned, urgent, and resolved tickets.",
      "Assign tickets to support agents or take over escalations.",
      "Reply to users, add internal notes, and move tickets through the support status workflow.",
      "Use ticket categories and priorities to triage account, billing, dispute help, and technical issues.",
    ],
  },
  {
    category: "Platform",
    title: "Admin Guide",
    route: "/admin-knowledge-base",
    summary: "This admin-only knowledge base and PDF export.",
    functions: [
      "Read operating guidance by admin area.",
      "Use the complete feature index to find admin pages and platform functions.",
      "Download the confidential admin guide PDF for offline review.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Credit Reporting Companies",
    route: "/bureaus",
    summary: "Reference data for supported credit reporting companies and dispute contact details.",
    functions: [
      "Review TransUnion and Equifax reference information.",
      "Confirm dispute mailing addresses and bureau-specific context.",
      "Support packet and reference workflows with current bureau details.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Laws",
    route: "/statutes",
    summary: "Statutory reference library used by compliance and dispute workflows.",
    functions: [
      "Review federal and provincial statutes and versions.",
      "Inspect jurisdiction, section, and effective-date reference details.",
      "Use references as review support without treating them as automatic legal conclusions.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Reporting Format Guide",
    route: "/metro2-compliance",
    summary: "Metro 2 and reporting-format guidance used to explain reporting issues.",
    functions: [
      "Review Metro 2 reporting concepts and supported format guidance.",
      "Compare report data against reporting-format expectations.",
      "Use guidance when reviewing compliance findings and parser output.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Rules Creditors Must Follow",
    route: "/creditor-obligations",
    summary: "Reference material for creditor and furnisher duties.",
    functions: [
      "Review creditor validation duties and dispute response expectations.",
      "Use creditor obligation references when assessing account-level findings.",
      "Support consumer-safe wording that separates references from conclusions.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Rules Credit Reporting Companies Must Follow",
    route: "/bureau-obligations",
    summary: "Reference material for credit reporting company obligations.",
    functions: [
      "Review bureau dispute, investigation, correction, and reporting duties.",
      "Use bureau obligation references when triaging bureau-side issues.",
      "Support packet and evidence review without changing rule truth.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Rules Collectors Must Follow",
    route: "/collector-obligations",
    summary: "Reference material for collector obligations and license-related review.",
    functions: [
      "Review collector conduct, validation, fee, limitation, and license references.",
      "Use licensed agency data and verification context when available.",
      "Support admin review of collection-account findings.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Enforcement",
    route: "/enforcement-mechanisms",
    summary: "Reference material for complaint paths, enforcing bodies, and remedies.",
    functions: [
      "Review available enforcement mechanisms by context.",
      "Identify regulator, complaint, penalty, and escalation reference data.",
      "Support consumer guidance without overstating confirmed legal outcomes.",
    ],
  },
  {
    category: "Legal & Rules",
    title: "Regulatory Updates",
    route: "/regulatory-updates",
    summary: "Review lane for monitored or manually entered legal and regulatory changes.",
    functions: [
      "Review detected, manual, under-review, verified, and applied updates.",
      "Track source, jurisdiction, status, and impact details.",
      "Apply or roll back reviewed changes only through approved regulatory workflows.",
    ],
  },
  {
    category: "Tools",
    title: "Lifecycle Testing",
    route: "/admin-mock-lifecycle",
    summary: "Admin-only mock lifecycle runner for end-to-end dispute workflow validation.",
    functions: [
      "Run initial and follow-up report scenarios with uploaded or server-side fixtures.",
      "Configure simulated day gaps, packet counts, strict mode, DB assist, base URL, and origin.",
      "Monitor queued, running, completed, and failed lifecycle jobs.",
      "Open generated lifecycle reports and coverage matrices.",
    ],
  },
  {
    category: "Tools",
    title: "Parser Testing",
    route: "/admin-parser-testing",
    summary: "Regression harness for credit report parsing and extraction quality.",
    functions: [
      "Create parser test cases with sample reports and expected output.",
      "Run individual tests or batch suites against current parser behavior.",
      "Review expected-versus-actual output and saved parser results.",
      "Adjudicate changed results only when admin review confirms the new truth.",
      "Use violation correction tabs when parser, evidence, or reference defects require repair.",
    ],
  },
  {
    category: "Tools",
    title: "Parser Mappings",
    route: "/admin-parser-mappings",
    summary: "Configuration and review tools for parser field mappings and bureau detection.",
    functions: [
      "Review and edit field mapping definitions.",
      "Use the mapping test harness before relying on mapping changes.",
      "Review mapping change history.",
      "Configure bureau detection markers and weights.",
    ],
  },
  {
    category: "Tools",
    title: "AI Assist",
    route: "/admin-ai-assist",
    summary: "Guarded admin-only AI checks, lookup, and explanation previews.",
    functions: [
      "Review AI assist runs and findings.",
      "Use AI output as diagnostic support only.",
      "Keep deterministic parser, violation, evidence, and regulation truth behind admin review.",
    ],
  },
  {
    category: "Tools",
    title: "Version Management",
    route: "/admin-version-management",
    summary: "Release, migration status, feature flag, and version note management.",
    functions: [
      "Create, release, archive, and review software versions.",
      "Review migration metadata and mark status without implying SQL execution.",
      "Manage feature flags scoped to global, admin, or user audiences.",
      "Edit release notes and communicate changes consistently.",
    ],
  },
  {
    category: "Tools",
    title: "Letter Templates",
    route: "/admin-letter-templates",
    summary: "Legacy template tooling status page for the current build.",
    functions: [
      "Confirm that historical packet viewing, download, and mailing remain active.",
      "Confirm that new packet creation runs through the readiness-gated packet workflow.",
      "Confirm legacy template management is disabled in this build.",
    ],
  },
  {
    category: "Reference",
    title: "Licensed Agency Data",
    summary: "Collection agency registry and verification functions used by collector review workflows.",
    functions: [
      "List licensed collection agency records through the licensed-agency API.",
      "Import Ontario open data through the guarded import endpoint when approved.",
      "Run licensed agency checks for collector-account review.",
      "Use AI verification as diagnostic support only, not automatic truth.",
    ],
  },
  {
    category: "Reference",
    title: "Platform Functions PDF",
    summary: "Downloadable reference of the full product feature set.",
    functions: [
      "Export a complete platform functions reference from the sidebar.",
      "Use the reference to understand consumer, admin, legal, packet, billing, support, and analytics coverage.",
      "Treat the PDF as documentation; it does not modify system state.",
    ],
  },
] as const;

export const platformFunctionGroups: readonly PlatformFunctionGroup[] = [
  {
    title: "Report Ingestion & Parsing",
    intro:
      "Comprehensive pipeline for ingesting, parsing, and extracting structured data from credit reports across supported formats.",
    items: [
      "Upload credit reports (PDF or HTML).",
      "Anonymous upload preview for prospects.",
      "Deterministic PDF text extraction and bureau-specific parser rule packs.",
      "Bureau-specific parsing for TransUnion, Equifax, and supported PDF text layouts.",
      "Weighted automatic bureau detection.",
      "Dual-pass deterministic extraction for quick and comprehensive parsing.",
      "Consumer info extraction for name, address, date of birth, phone, SIN, and employment fields.",
      "Tradeline extraction with field-level confidence scoring.",
      "Credit score extraction.",
      "Inquiry extraction for hard, soft, and promotional inquiries.",
      "Public record and bankruptcy extraction.",
      "Consumer statement extraction.",
      "Cross-bureau matching for duplicate tradeline detection.",
      "Report artifact versioning and SHA-256 integrity hashing.",
      "Scanned document support after deterministic OCR before canonical ingestion.",
    ],
  },
  {
    title: "Compliance Scanning & Violation Detection",
    intro:
      "Automated auditing engine that flags regulatory, logical, and formatting risks in credit reporting data.",
    items: [
      "45+ violation categories scanned by configured detectors.",
      "Bureau-specific compliance detectors for reporting format, balance, status, temporal, and date logic.",
      "Creditor and furnisher detectors for chronology conflicts, unverifiable debt records, generic responses, and related risks.",
      "Collector-specific detectors for licensing, fees, limitation revival, and duplicate reporting.",
      "Cross-entity discrepancy detection.",
      "Dynamic scanning rules from explicit deterministic admin definitions.",
      "Compliance configuration per violation category with enablement and confidence threshold controls.",
      "Regulation infraction scanner with statutory basis references.",
      "Metro 2 validation logging.",
    ],
  },
  {
    title: "Packet Generation, Viewing & Delivery",
    intro:
      "Dispute packet generation is active for packet-ready findings with verified evidence.",
    items: [
      "Packet recommendation, preview, creation, saving, listing, retrieval, and PDF download endpoints.",
      "Readiness validation blocks parser-uncertain, unverified, dismissed, and missing-evidence findings.",
      "Historical packet PDF rendering.",
      "Historical packet compliance and evidence records.",
      "PostGrid registered mail delivery integration.",
      "First-class mail delivery option.",
      "Tracking number and delivery status monitoring.",
      "Packet impact assessment comparing baseline and follow-up snapshots.",
      "Packet readiness validation before sending.",
      "Cloud storage for historical PDFs.",
    ],
  },
  {
    title: "Obligation Tracking & Escalation",
    intro:
      "Tracks statutory obligations and manages the procedural lifecycle of credit challenges.",
    items: [
      "80 statutory obligations across credit bureau, creditor, and bill collector sections.",
      "Obligation lifecycle from pending to challenged, response states, and procedural exhaustion.",
      "Four-phase terminal label progression.",
      "Response recording with audit fields for MOV, documentation, signatures, and sender address.",
      "Response analysis pipeline.",
      "Auto-escalation engine with configurable triggers.",
      "Pressure score calculation per obligation instance.",
      "Dispute vector tracking and rotation strategy.",
      "Vector rotation analytics.",
      "Success metrics tracking by outcomes and response times.",
      "Creditor obligation testing.",
    ],
  },
  {
    title: "Evidence Chain Management",
    intro:
      "Secure, tamper-evident logging and storage of evidence related to disputes and compliance.",
    items: [
      "Tamper-evident SHA-256 linked evidence event chain.",
      "Evidence event logging per packet.",
      "Evidence attachment upload and storage.",
      "Evidence packaging for regulatory complaints.",
      "Bureau communication evidence recording.",
      "Challenge evidence panel.",
      "Statute version linkage for regulatory context.",
    ],
  },
  {
    title: "Bureau & Creditor Management",
    intro:
      "Centralized registries and verification tools for credit bureaus and furnisher entities.",
    items: [
      "Bureau registry for TransUnion and Equifax with addresses.",
      "Bureau dispute contact addresses.",
      "Creditor entity registry with contact information.",
      "Creditor name normalization with French-Canadian support.",
      "Creditor validation requirements tracking.",
      "Collection agency license verification with Ontario open data integration.",
      "Licensed collection agency registry with diagnostic AI verification.",
      "Cross-bureau tradeline matching.",
    ],
  },
  {
    title: "Tradeline Management",
    intro:
      "Detailed tracking, snapshotting, and monitoring of individual credit accounts over time.",
    items: [
      "Full tradeline detail view.",
      "Tradeline snapshot versioning.",
      "Change detection between report uploads.",
      "Drift monitoring and logging.",
      "Compliance rescan on demand.",
      "Tradeline search and filtering.",
      "Backfill source text from original reports.",
      "Gap-fill repair through deterministic parser rules and admin-corrected fixtures.",
      "Payment history tracking with delinquency analysis.",
      "Related collection account linking.",
    ],
  },
  {
    title: "Subscription & Billing",
    intro:
      "Subscription plans and payment processing for user access and postal delivery transactions.",
    items: [
      "Seven-day free trial for new registrations.",
      "Monthly and annual paid plans.",
      "Stripe payment integration.",
      "Subscription status tracking for trialing, active, past due, cancelled, and expired states.",
      "Plan upgrade and downgrade.",
      "Subscription cancellation with reason tracking.",
      "Trial countdown banner.",
      "Account locking after trial expiry without subscription.",
      "Renewal reminder emails.",
      "PostGrid postal transaction billing with markup tracking.",
    ],
  },
  {
    title: "User Management & Authentication",
    intro:
      "Secure access control, profile management, and session handling for platform users.",
    items: [
      "Email and password registration and login.",
      "Google OAuth login through the configured OAuth provider.",
      "Email verification with token-based flow.",
      "Password reset by email.",
      "JWT session management with cleanup.",
      "Rate limiting on authentication endpoints.",
      "Login attempt tracking.",
      "Profile management for name, address, province, date of birth, and phone.",
      "Profile completion checks.",
      "Terms of service acceptance tracking with versioning.",
      "Domain guard controls for published domains.",
    ],
  },
  {
    title: "Admin Dashboard & Tools",
    intro:
      "Internal tools for managing users, system configurations, parser quality, and platform health.",
    items: [
      "User management with list, detail, reset, and delete actions.",
      "Compliance configuration management.",
      "Feature flag management scoped globally, to admins, or to users.",
      "System settings management.",
      "User-facing and admin knowledge base PDF generation.",
      "Parser testing suite for creating, running, importing, and exporting test cases.",
      "Parser mapping and known-entity management.",
      "Version management for software versions, releases, and archive status.",
      "Release notes management.",
      "Data retention automation with purge scheduling.",
      "Semantic accuracy diagnostic.",
      "Backfill compliance scans across tradelines.",
      "Seed data management for bureaus, statutes, obligations, and creditor validations.",
      "Audit log viewer with entity-type filtering.",
      "Support agent account creation.",
      "Postal revenue tracking and reporting.",
      "Stale authentication cleanup.",
    ],
  },
  {
    title: "Customer Support System",
    intro:
      "Integrated ticketing system for user questions, triage, and support communication.",
    items: [
      "User ticket submission by category.",
      "Priority levels from low to urgent.",
      "Support agent ticket queue management.",
      "Ticket assignment to agents.",
      "Threaded replies with internal notes.",
      "Status workflow from open to resolved or closed.",
      "Email notifications on ticket events.",
      "Near-real-time polling for ticket lists and details.",
      "AI-powered support chat for diagnostic triage.",
    ],
  },
  {
    title: "Identity Theft Protection",
    intro:
      "Tools for managing freezes, fraud alerts, and identity theft documentation.",
    items: [
      "Security freeze management.",
      "Fraud alert filing.",
      "Extended fraud alert support.",
      "Thaw request processing.",
      "Freeze timeline visualization.",
      "Freeze protection statistics.",
      "Consumer signature capture and verification.",
      "Identity theft report upload and documentation.",
    ],
  },
  {
    title: "Regulatory Intelligence",
    intro:
      "Reference library and monitoring workflow for statutes, regulatory changes, and industry standards.",
    items: [
      "Statute registry with jurisdictional coverage.",
      "Statute of limitations tracking.",
      "Regulatory update monitoring from automated scan and manual entry.",
      "Regulatory update lifecycle from detected to applied.",
      "Regulatory notification read and dismiss workflow.",
      "Auto-escalation of regulatory changes.",
      "Regulatory rollback support.",
      "Federal guidance reference library.",
      "Industry standard references for reporting format specifications.",
      "Enforcement mechanism registry.",
      "Discrimination claim tracking for Canadian Human Rights grounds.",
    ],
  },
  {
    title: "Calendar & Deadline Management",
    intro:
      "Scheduling and deadline tracking for compliance and dispute activity.",
    items: [
      "Response deadline tracking per obligation instance.",
      "Compliance calendar views.",
      "Deadline creation, completion, and deletion.",
      "Overdue deadline alerts.",
      "Quick actions for upcoming deadlines.",
      "Calendar event dialogs.",
    ],
  },
  {
    title: "Analytics & Reporting",
    intro:
      "Dashboards and exports for platform usage, success rates, and risk review.",
    items: [
      "Dashboard statistics for tradelines, violation rates, and packet status.",
      "Success analytics by vector, bureau, and creditor.",
      "Analytics report PDF generation.",
      "Compliance audit documentation export.",
      "CSV export for tradelines, violations, and obligations.",
      "Hidden risk register.",
      "Dispute journey tracker visualization.",
      "Dispute rotation analytics.",
    ],
  },
  {
    title: "Bankruptcy Management",
    intro:
      "Tracking and lifecycle management for bankruptcy records and removal dates.",
    items: [
      "Bankruptcy record tracking for supported bankruptcy and proposal types.",
      "Provincial retention rule calculation.",
      "Expected versus actual removal date tracking.",
      "Bureau-specific reporting status for TransUnion and Equifax.",
      "Bankruptcy status lifecycle management.",
    ],
  },
  {
    title: "Landing Page & Conversion",
    intro:
      "Public-facing pages for prospects, onboarding, and conversion.",
    items: [
      "Public landing page with hero, features, pricing, compliance, and how-it-works sections.",
      "Anonymous upload preview.",
      "Lead reminder capture.",
      "Get Your Report guide.",
      "Contact page.",
      "Privacy policy and Terms of service pages.",
      "User manual and knowledge base.",
    ],
  },
] as const;
