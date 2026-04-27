import type { Content } from "pdfmake/interfaces";

export const adminKbPdfContentSections = () => {
  return {
    section1: (): Content[] => [
      { text: "1. Overview & Architecture", style: "header", tocItem: true, id: "sec1" },
      { text: "The Admin Dashboard provides full control over the Credit Regulator Pro platform. It is strictly limited to authorized personnel.", style: "body" },
      { text: "Admin Responsibilities", style: "subHeader" },
      { ul: [
        "Manage user accounts and subscription states.",
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
      ], style: "list" },
    ],
    section6: (): Content[] => [
      { text: "6. Operations", style: "header", tocItem: true, id: "sec6" },
      { text: "System monitoring and maintenance tools to ensure high availability and compliance.", style: "body" },
      { ul: [
        "Activity Logs: Track user actions including logins, uploads, and packet generation across the entire system.",
        "Error Logs: Review system failures, failed extractions, and exceptions for detailed debugging.",
        "Data Retention: Monitor compliance with the strict 1-year data retention policy and trigger manual cleanups if necessary.",
      ], style: "list" },
    ],
    section7: (): Content[] => [
      { text: "7. Licensed Agencies & Regulatory Updates", style: "header", tocItem: true, id: "sec7" },
      { text: "Maintain the underlying regulatory intelligence of the platform to ensure ongoing compliance with Canadian law.", style: "body" },
      { ul: [
        "Licensed Agencies: Review and verify debt collection agency licenses against official provincial databases.",
        "Regulatory Updates: Track and quickly apply changes in case law, statutes, and enforcement mechanisms directly to the system's compliance logic.",
      ], style: "list" },
    ],
  };
};