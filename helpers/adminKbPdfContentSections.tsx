import type { Content } from "pdfmake/interfaces";
import { adminKbFeatureGroups, platformFunctionGroups } from "./adminKnowledgeBaseContent";

const list = (items: readonly string[]): Content => ({ ul: [...items], style: "list" });

const adminFunctionIndex = (): Content[] => [
  { text: "8. Complete Admin Feature Index", style: "header", tocItem: true, id: "sec8" },
  {
    text:
      "This index covers every admin-facing route, reference surface, and guarded administrative function documented for the current build.",
    style: "body",
  },
  ...adminKbFeatureGroups.flatMap((group): Content[] => [
    {
      text: `${group.title}${group.route ? ` (${group.route})` : ""}`,
      style: "subHeader",
    },
    { text: group.summary, style: "body" },
    list(group.functions),
  ]),
];

const platformFunctionCatalog = (): Content[] => [
  { text: "9. Platform Feature and Function Catalog", style: "header", tocItem: true, id: "sec9" },
  {
    text:
      "The full product map is included so admins can connect support, triage, regulatory review, release decisions, and consumer workflows.",
    style: "body",
  },
  ...platformFunctionGroups.flatMap((group): Content[] => [
    { text: group.title, style: "subHeader" },
    { text: group.intro, style: "body" },
    list(group.items),
  ]),
];

export const adminKbPdfContentSections = () => {
  return {
    section1: (): Content[] => [
      { text: "1. Overview & Architecture", style: "header", tocItem: true, id: "sec1" },
      { text: "The Admin Dashboard provides full control over the Credit Regulator Pro platform. It is strictly limited to authorized personnel.", style: "body" },
      { text: "Admin Responsibilities", style: "subHeader" },
      { ul: [
        "Manage user accounts and subscription states.",
        "Triage active hidden-risk findings and support escalations.",
        "Configure compliance detection thresholds.",
        "Manage system versions, migrations, and feature flags.",
        "Monitor system activity and error logs.",
        "Test and validate document parsing engines.",
      ], style: "list" },
    ],
    section2: (): Content[] => [
      { text: "2. User Management", style: "header", tocItem: true, id: "sec2" },
      { text: "The User Management dashboard provides a comprehensive view of all registered accounts.", style: "body" },
      { text: "Key Actions", style: "subHeader" },
      { ul: [
        "View user roles and organization associations.",
        "Monitor usage statistics (tradelines, packets, evidence events).",
        "Create Support Agents: Use the dedicated creation flow to provision customer service accounts.",
        "Reset Data: Admins can trigger data resets for users in specific error states to clear invalid data.",
        "Support Tickets: Review, assign, answer, and escalate user tickets.",
        "Risk Triage: Review active findings, open correction workflows, or mark false positives after admin review.",
      ], style: "list" },
    ],
    section3: (): Content[] => [
      { text: "3. Compliance Configuration", style: "header", tocItem: true, id: "sec3" },
      { text: "Tune the compliance detection engine to balance sensitivity and accuracy across the system.", style: "body" },
      { text: "Thresholds & Messaging", style: "subHeader" },
      { ul: [
        "Adjust confidence thresholds for various violation categories to reduce false positives.",
        "Enable or disable specific detectors globally.",
        "Customize alert messaging (user explanations and recommended actions) for each violation type to guide end users.",
        "Configure postal delivery pricing and surcharge settings.",
        "Control production mode for paid-plan enforcement.",
      ], style: "list" },
    ],
    section4: (): Content[] => [
      { text: "4. Version Management", style: "header", tocItem: true, id: "sec4" },
      { text: "Manage the application's lifecycle, updates, and feature rollouts securely.", style: "body" },
      { ul: [
        "Versions: Track released software versions, code lines, and manage release notes.",
        "Migrations: Monitor and verify database schema changes and their operational statuses.",
        "Feature Flags: Toggle beta features for specific users, admins, or globally to manage phased rollouts.",
      ], style: "list" },
    ],
    section5: (): Content[] => [
      { text: "5. Parser Testing", style: "header", tocItem: true, id: "sec5" },
      { text: "Ensure the reliability and accuracy of the credit report ingestion and extraction engines.", style: "body" },
      { ul: [
        "Maintain a comprehensive suite of PDF and HTML test cases.",
        "Run individual or batch regression tests against new parser logic updates.",
        "View detailed comparison results between expected outputs and actual extraction output.",
        "Review parser mappings, mapping history, and bureau detection configuration.",
        "Run lifecycle tests that simulate complete user report, packet, and follow-up flows.",
        "Use AI Assist for admin-only diagnostics without changing deterministic truth.",
      ], style: "list" },
    ],
    section6: (): Content[] => [
      { text: "6. Operations", style: "header", tocItem: true, id: "sec6" },
      { text: "System monitoring and maintenance tools to ensure high availability and compliance.", style: "body" },
      { ul: [
        "Activity Logs: Track user actions including logins, uploads, historical packet activity, and delivery records across the entire system.",
        "Error Logs: Review system failures, failed extractions, and exceptions for detailed debugging.",
        "Security & Compliance: Review audit logs, data retention, semantic audit, domain guard, anti-duplication, and content protection.",
        "Data Retention: Monitor compliance with the strict 1-year data retention policy and trigger approved cleanups if necessary.",
        "Platform Functions PDF: Export the full product feature reference from the admin sidebar.",
      ], style: "list" },
    ],
    section7: (): Content[] => [
      { text: "7. Licensed Agencies & Regulatory Updates", style: "header", tocItem: true, id: "sec7" },
      { text: "Maintain the underlying regulatory intelligence of the platform to ensure ongoing compliance with Canadian law.", style: "body" },
      { ul: [
        "Licensed Agencies: Review and verify debt collection agency licenses against official provincial databases.",
        "Regulatory Updates: Track and quickly apply changes in case law, statutes, and enforcement mechanisms directly to the system's compliance logic.",
        "Legal & Rules Reference: Review bureaus, laws, reporting-format guidance, creditor obligations, bureau obligations, collector obligations, and enforcement mechanisms.",
        "Letter Templates: Confirm legacy template tooling status and use the readiness-gated packet workflow for new packet creation.",
      ], style: "list" },
    ],
    section8: adminFunctionIndex,
    section9: platformFunctionCatalog,
  };
};
