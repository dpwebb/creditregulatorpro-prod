import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { generateServerPdf } from "../helpers/pdfServerUtils";

type Manual = {
  name: string;
  slug: string;
  route: string;
  overview: string;
  purpose: string;
  dashboard: string[];
  tasks: string[];
  cautions: string[];
  notes?: string[];
};

const outputDir = "docs/admin-manuals";
const generatedDate = "May 9, 2026";

const accessRequirements = [
  "Sign in with an account that has admin access.",
  "Use the staging or production URL assigned by operations.",
  "Do not share admin sessions, reset links, exported files, or customer records.",
  "If access is denied, confirm the account role before retrying the workflow.",
];

const manuals: Manual[] = [
  {
    name: "Home Dashboard",
    slug: "home-dashboard",
    route: "/",
    overview: "The Home dashboard is the admin starting point for reviewing platform activity and opening operational tools.",
    purpose: "Use this page to orient yourself before working queues, user records, reports, or settings.",
    dashboard: ["Summary cards show high-level activity.", "Navigation links open the main admin sections.", "Recent activity helps identify what needs attention first."],
    tasks: ["Review platform status.", "Move to the correct admin section.", "Refresh after major work to confirm dashboard values update."],
    cautions: ["Do not use dashboard counts as the only proof that a workflow completed."],
  },
  {
    name: "User Management",
    slug: "user-management",
    route: "/admin-user-management",
    overview: "User Management lists customer, support, and admin accounts with status and activity counts.",
    purpose: "Use this section to find users, review role and subscription state, create support agents, and perform approved reset workflows.",
    dashboard: ["Search finds users by email or display name.", "Role filter narrows the list.", "Pagination shows the visible range and total matching users.", "User cards show plan, role, and activity counts."],
    tasks: ["Find a user account.", "Confirm role and subscription status.", "Create a support agent when approved.", "Reset user data only for approved repair cases."],
    cautions: ["Never reset a user without written approval.", "Use exact email confirmation for sensitive actions.", "Setup links should point to the current environment."],
    notes: ["Pagination now uses total record counts.", "Support-agent setup links are environment-aware after the 2026-05-09 repair."],
  },
  {
    name: "Risk Triage",
    slug: "risk-triage",
    route: "/admin-risk-triage",
    overview: "Risk Triage helps admins review high-risk accounts, parser issues, and finding correction candidates.",
    purpose: "Use this section to decide which reports or accounts need manual review before customer-facing output is trusted.",
    dashboard: ["Queue rows identify records that need review.", "Filters narrow by status, queue type, or severity.", "Actions link to parser review or finding correction workflows."],
    tasks: ["Review high-risk items.", "Open correction workflow for a finding.", "Escalate parser defects.", "Confirm evidence before relying on a finding."],
    cautions: ["Do not finalize unsupported findings.", "Clear filters if an expected queue item is hidden."],
  },
  {
    name: "Rule Check Settings",
    slug: "rule-check-settings",
    route: "/admin-compliance-config",
    overview: "Rule Check Settings controls detector thresholds, rule messaging, postal pricing, and limited production-mode settings.",
    purpose: "Use this section to tune how compliance findings are detected and explained.",
    dashboard: ["Rule cards show each violation category.", "Threshold fields control sensitivity.", "Message fields control user-facing explanation text.", "Pricing fields control postal cost settings."],
    tasks: ["Adjust a detection threshold.", "Update customer-facing wording.", "Change postal pricing values.", "Reset unsaved changes."],
    cautions: ["Change one rule at a time.", "Use only valid non-negative pricing numbers.", "Run regression tests after meaningful rule changes."],
    notes: ["Malformed postal pricing is rejected in both the UI and API."],
  },
  {
    name: "Activity Logs",
    slug: "activity-logs",
    route: "/admin-activity-logs",
    overview: "Activity Logs show important user and system actions across the platform.",
    purpose: "Use this section to confirm what happened, who performed an action, and when it occurred.",
    dashboard: ["Filters narrow logs by user, action, status, or date.", "Rows show action, entity, actor, timestamp, and result.", "Pagination moves through older results."],
    tasks: ["Confirm a user action occurred.", "Review admin settings changes.", "Trace upload, login, packet, or reset activity."],
    cautions: ["Do not export or paste logs into public channels.", "Use exact timestamps in support notes."],
  },
  {
    name: "Error Logs",
    slug: "error-logs",
    route: "/admin-error-logs",
    overview: "Error Logs list application errors and failed operations that need operational review.",
    purpose: "Use this section to diagnose failed saves, imports, exports, parser failures, and API errors.",
    dashboard: ["Severity filters separate warnings from critical errors.", "Search narrows by message, action, or user.", "Rows show the error time and context."],
    tasks: ["Investigate failed API calls.", "Review parser or PDF extraction failures.", "Confirm whether a save failure was logged."],
    cautions: ["Do not expose stack traces to customers.", "Prioritize repeated critical errors."],
  },
  {
    name: "Security & Compliance",
    slug: "security-compliance",
    route: "/admin-security",
    overview: "Security & Compliance contains audit log review, data retention controls, and semantic audit tools.",
    purpose: "Use this section to verify compliance controls and review retention or semantic-risk findings.",
    dashboard: ["Audit Logs tab reviews recorded activity.", "Data Retention tab reviews and enforces retention rules.", "Semantic Audit tab checks records for policy-sensitive content."],
    tasks: ["Review audit history.", "Check data retention status.", "Run semantic audit checks on approved scope.", "Export review results when required by policy."],
    cautions: ["Treat retention controls as destructive.", "Use the least necessary scope.", "Keep exported compliance files in approved storage only."],
    notes: ["This section was hidden from the sidebar before the 2026-05-09 repair and is now discoverable."],
  },
  {
    name: "Support Tickets",
    slug: "support-tickets",
    route: "/support-tickets",
    overview: "Support Tickets organizes customer support issues and their operational status.",
    purpose: "Use this section to triage, respond to, and close customer support requests.",
    dashboard: ["Ticket list shows subject, category, priority, and status.", "Filters narrow by status or priority.", "Ticket details show conversation and account context."],
    tasks: ["Assign or review a ticket.", "Find the related user account.", "Record the completed action.", "Close tickets only when the issue is resolved."],
    cautions: ["Keep notes factual and customer-safe.", "Do not include internal stack traces in replies."],
  },
  {
    name: "Admin Guide",
    slug: "admin-guide",
    route: "/admin-knowledge-base",
    overview: "Admin Guide provides internal operating instructions and reference content.",
    purpose: "Use this section to learn standard workflows before changing settings or running sensitive tools.",
    dashboard: ["Topic sections group operating guidance.", "PDF export makes the guide portable.", "Navigation helps locate a specific workflow."],
    tasks: ["Review a workflow before using it.", "Export the platform functions PDF.", "Find escalation guidance."],
    cautions: ["Do not add secrets or customer data to documentation.", "Report outdated content for update."],
  },
  {
    name: "Letter Templates",
    slug: "letter-templates",
    route: "/admin-letter-templates",
    overview: "Letter Templates controls reusable text for dispute and support packet generation.",
    purpose: "Use this section to review and maintain approved template language.",
    dashboard: ["Template list shows available templates.", "Template editor displays editable wording.", "Save controls persist approved changes."],
    tasks: ["Update approved wording.", "Review a template for plain language.", "Confirm a template still fits the intended workflow."],
    cautions: ["Avoid unsupported legal conclusions.", "Document why a template changed."],
  },
  {
    name: "Credit Reporting Companies",
    slug: "credit-reporting-companies",
    route: "/bureaus",
    overview: "This section stores reference information about credit reporting companies.",
    purpose: "Use it to confirm bureau names, addresses, contacts, and operational details used by the platform.",
    dashboard: ["Reference records list bureau details.", "Search or browse helps find a company.", "Details support packet and compliance workflows."],
    tasks: ["Confirm bureau contact information.", "Review bureau-specific handling notes.", "Check reference data before packet generation."],
    cautions: ["Do not manually change reference data without verification.", "Record the source for significant reference changes."],
  },
  {
    name: "Laws",
    slug: "laws",
    route: "/statutes",
    overview: "Laws provides statutory reference material used by compliance and dispute workflows.",
    purpose: "Use this section to understand which legal references support findings and templates.",
    dashboard: ["Law records show statute names and summaries.", "Details provide jurisdiction and reference context.", "Related sections link to obligations and enforcement concepts."],
    tasks: ["Confirm a statutory reference.", "Review jurisdiction-specific context.", "Support an admin correction decision."],
    cautions: ["Do not give legal advice to customers.", "Use references as operational support only."],
  },
  {
    name: "Reporting Format Guide",
    slug: "reporting-format-guide",
    route: "/metro2-compliance",
    overview: "Reporting Format Guide explains credit-reporting format expectations and Metro 2 style data concepts.",
    purpose: "Use this section to interpret fields and formatting issues during parser and rule review.",
    dashboard: ["Guide content groups field and reporting concepts.", "Reference entries support parser mapping decisions.", "Examples help identify malformed report data."],
    tasks: ["Review field meaning.", "Support parser mapping decisions.", "Explain why a report field may be inconsistent."],
    cautions: ["Separate format issues from legal violation findings.", "Use exact field names when documenting defects."],
  },
  {
    name: "Rules Creditors Must Follow",
    slug: "creditor-rules",
    route: "/creditor-obligations",
    overview: "This section summarizes creditor obligations used in review and packet workflows.",
    purpose: "Use it to understand creditor duties when reviewing possible inaccurate or unfair reporting.",
    dashboard: ["Obligation records describe creditor duties.", "Details explain timing, evidence, and escalation context.", "References support admin decisions."],
    tasks: ["Confirm a creditor obligation.", "Support a correction or packet review.", "Identify missing evidence before finalizing."],
    cautions: ["Use evidence-first review.", "Keep admin notes neutral.", "Do not overstate the rule outcome."],
  },
  {
    name: "Rules Credit Reporting Companies Must Follow",
    slug: "bureau-rules",
    route: "/bureau-obligations",
    overview: "This section summarizes credit reporting company obligations.",
    purpose: "Use it to review bureau duties for accuracy, investigation, and correction workflows.",
    dashboard: ["Obligation list shows bureau responsibilities.", "Details support evidence and escalation decisions.", "References align with dispute packet workflows."],
    tasks: ["Confirm bureau obligations.", "Review dispute response responsibilities.", "Support evidence linking."],
    cautions: ["Confirm the bureau name in the report.", "Do not combine separate obligations into one finding."],
  },
  {
    name: "Rules Collectors Must Follow",
    slug: "collector-rules",
    route: "/collector-obligations",
    overview: "This section summarizes collector obligations used in collection-account review.",
    purpose: "Use it to evaluate collection reporting, payment acknowledgement, and dispute handling issues.",
    dashboard: ["Collector obligation records show duties and examples.", "Details help identify required evidence.", "References support correction review."],
    tasks: ["Review collector reporting duties.", "Confirm evidence for a collector issue.", "Support escalation when a response is inadequate."],
    cautions: ["Separate collector duties from bureau duties.", "Use clear evidence excerpts.", "Avoid unsupported conclusions."],
  },
  {
    name: "Enforcement",
    slug: "enforcement",
    route: "/enforcement-mechanisms",
    overview: "Enforcement summarizes available regulatory or procedural enforcement paths.",
    purpose: "Use this section to understand escalation options and operational context.",
    dashboard: ["Records describe enforcement mechanisms.", "Details explain when a mechanism may apply.", "References connect to laws and obligations."],
    tasks: ["Review escalation options.", "Support internal triage.", "Understand possible next steps after failed correction."],
    cautions: ["Keep enforcement notes internal unless approved.", "Use cautious language.", "Verify jurisdiction before relying on an entry."],
  },
  {
    name: "Regulatory Updates",
    slug: "regulatory-updates",
    route: "/regulatory-updates",
    overview: "Regulatory Updates tracks changes that may affect platform rules, references, and workflows.",
    purpose: "Use this section to review and apply approved regulatory knowledge updates.",
    dashboard: ["Update list shows pending or historical regulatory changes.", "Details explain source, scope, and affected areas.", "Actions support review and operational follow-up."],
    tasks: ["Review new regulatory changes.", "Identify affected rule categories.", "Coordinate updates to templates, settings, or references."],
    cautions: ["Do not change rules based on unverified updates.", "Re-test affected workflows after rule changes."],
  },
  {
    name: "Lifecycle Testing",
    slug: "lifecycle-testing",
    route: "/admin-mock-lifecycle",
    overview: "Lifecycle Testing runs controlled mock-user workflows for end-to-end validation.",
    purpose: "Use this section to test the platform lifecycle without using a real customer account.",
    dashboard: ["Controls create or manage mock lifecycle runs.", "Run output shows each stage and result.", "Cleanup actions remove mock test data when approved."],
    tasks: ["Run a mock user lifecycle.", "Validate upload-to-packet flow.", "Confirm cleanup behavior."],
    cautions: ["Use only disposable mock accounts.", "Do not run cleanup against a real user."],
  },
  {
    name: "Parser Testing",
    slug: "parser-testing",
    route: "/admin-parser-testing",
    overview: "Parser Testing validates credit report extraction, saved test cases, parser output, and finding corrections.",
    purpose: "Use this section to confirm report ingestion and extraction behave correctly before relying on findings.",
    dashboard: ["Test case list stores sample reports.", "Parser controls execute extraction.", "Saved output panels compare expected and actual results.", "Finding Corrections tab lets admins correct extracted findings."],
    tasks: ["Run parser regression cases.", "Review extracted tradelines.", "Compare saved output.", "Delete obsolete test cases only when approved."],
    cautions: ["Keep test cases sanitized.", "Use deterministic fixtures for regression checks.", "Escalate recurring parser failures with the test case ID."],
  },
  {
    name: "Finding Corrections",
    slug: "finding-corrections",
    route: "/admin-parser-testing?tab=violation-corrections",
    overview: "Finding Corrections is the admin truth-layer for reviewing, correcting, rejecting, or finalizing extracted findings.",
    purpose: "Use this section when a machine finding needs human review, evidence linking, regulation mapping, or training feedback.",
    dashboard: ["Run list shows extraction runs and finding counts.", "Tradeline list shows accounts in the run.", "Original Extraction shows machine findings.", "Admin Correction stores corrected status and notes.", "Evidence and Regulation Mapping panels support finalized findings."],
    tasks: ["Confirm a correct machine finding.", "Correct a partially wrong finding.", "Reject a false positive.", "Add a missed issue.", "Mark a training note only.", "Verify or mark regulation references incorrect."],
    cautions: ["Finalize only when evidence and regulation requirements are satisfied.", "Use the trash icon only for delete actions.", "Keep reviewer notes factual."],
    notes: ["Reference status actions are visually distinct after the 2026-05-09 repair."],
  },
  {
    name: "Parser Mappings",
    slug: "parser-mappings",
    route: "/admin-parser-mappings",
    overview: "Parser Mappings controls how report text fields are interpreted and assigned to platform fields.",
    purpose: "Use this section to review and maintain mapping rules that support deterministic extraction.",
    dashboard: ["Mapping list shows known field mappings.", "Search and filters narrow by bureau or field.", "Actions update mapping status or details."],
    tasks: ["Find a mapping.", "Review field normalization.", "Correct a stale mapping.", "Confirm a parser rule after a report format change."],
    cautions: ["Avoid broad mapping changes without fixture coverage.", "Escalate conflicting mappings before saving."],
  },
  {
    name: "AI Assist",
    slug: "ai-assist",
    route: "/admin-ai-assist",
    overview: "AI Assist helps admins draft operational summaries and investigate support or compliance context.",
    purpose: "Use this section for internal assistance, not as a replacement for evidence review or admin judgment.",
    dashboard: ["Prompt area accepts admin questions.", "Response area returns assistance for selected context.", "Controls manage submission and review."],
    tasks: ["Summarize a support issue.", "Draft internal notes.", "Identify possible next review steps."],
    cautions: ["Do not paste secrets or reset links.", "Verify important facts in the source record before acting."],
  },
  {
    name: "Version Management",
    slug: "version-management",
    route: "/admin-version-management",
    overview: "Version Management tracks releases, migration status, and feature flags.",
    purpose: "Use this section to understand release state and manage feature availability under approved change control.",
    dashboard: ["Versions tab lists release records.", "Migrations tab shows migration metadata and status.", "Feature Flags tab controls staged feature access."],
    tasks: ["Review current release version.", "Mark migration metadata after verification.", "Enable or disable a feature flag for an approved audience."],
    cautions: ["Migration status buttons do not execute SQL.", "Use change approval before altering feature flags."],
    notes: ["Migration buttons now say Mark Applied and Mark Rolled Back to match metadata-only behavior."],
  },
  {
    name: "Platform Functions PDF",
    slug: "platform-functions-pdf",
    route: "Sidebar footer download",
    overview: "The Platform Functions PDF export creates a downloadable reference guide for platform functions.",
    purpose: "Use this export when admins need an offline reference for platform capabilities.",
    dashboard: ["Download button appears in the admin sidebar footer.", "The generated file opens as a PDF.", "The guide summarizes platform functions and operating context."],
    tasks: ["Generate an offline function reference.", "Attach the PDF to approved internal training materials.", "Confirm PDF generation works after documentation changes."],
    cautions: ["Use current PDFs only.", "Do not distribute internal PDFs outside approved channels."],
  },
];

function section(title: string, body: Content[]): Content[] {
  return [{ text: title, style: "sectionHeader" }, ...body];
}

function paragraph(text: string): Content {
  return { text, style: "body" };
}

function bullets(items: string[]): Content {
  return { ul: items, style: "list" };
}

function numbers(items: string[]): Content {
  return { ol: items, style: "list" };
}

function stepsFor(manual: Manual): string[] {
  return [
    `Open ${manual.name}.`,
    "Confirm you are in the correct environment.",
    "Apply the needed search, filter, tab, or selection.",
    "Review the displayed information before making changes.",
    "Complete one action at a time.",
    "Refresh or reopen the page to confirm the result persisted.",
    "Check Activity Logs or Error Logs when confirmation is unclear.",
  ];
}

function docFor(manual: Manual): TDocumentDefinitions {
  const notes = [
    ...(manual.notes ?? []),
    "Screenshots are not embedded because live admin pages can expose user data. Add sanitized screenshots from a seeded training tenant when available.",
    "A task is complete only when the page shows the expected saved state, a refresh keeps the state, and related logs or downstream records agree with the change.",
  ];

  const content: Content[] = [
    { text: manual.name, style: "title" },
    { text: "Admin Training Manual", style: "subtitle" },
    { text: `Route: ${manual.route}`, style: "meta" },
    { text: `Generated: ${generatedDate}`, style: "meta", margin: [0, 0, 0, 18] },
    ...section("1. Section Overview", [paragraph(manual.overview)]),
    ...section("2. Purpose", [paragraph(manual.purpose)]),
    ...section("3. Access Requirements", [bullets(accessRequirements)]),
    ...section("4. Main Dashboard Overview", [bullets(manual.dashboard)]),
    ...section("5. Step-by-Step Instructions", [numbers(stepsFor(manual))]),
    ...section("6. Common Tasks", [bullets(manual.tasks)]),
    ...section("7. Common Errors", [bullets([
      "Page does not load or shows access denied.",
      "Search or filters hide the expected record.",
      "Save does not persist after refresh.",
      "A required field, evidence item, or approval is missing.",
    ])]),
    ...section("8. Troubleshooting", [bullets([
      "Refresh once and retry the exact action.",
      "Clear filters and search again.",
      "Confirm the account has admin access.",
      "Check Activity Logs for successful actions and Error Logs for failures.",
      "Stop and escalate if the workflow could change live customer data unexpectedly.",
    ])]),
    ...section("9. Best Practices", [bullets([
      "Work from the least risky action to the most sensitive action.",
      "Use exact emails, IDs, and timestamps when reviewing records.",
      "Keep notes short, factual, and customer-safe.",
      ...manual.cautions,
    ])]),
    ...section("10. Operational Notes", [bullets(notes)]),
  ];

  return {
    pageSize: "LETTER",
    pageMargins: [48, 56, 48, 56],
    content,
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.25, color: "#243042" },
    styles: {
      title: { fontSize: 28, bold: true, color: "#12355b", margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 14, color: "#4b647a", margin: [0, 0, 0, 10] },
      meta: { fontSize: 9.5, color: "#5d6f7f" },
      sectionHeader: { fontSize: 15, bold: true, color: "#12355b", margin: [0, 14, 0, 6] },
      body: { fontSize: 10.5, margin: [0, 0, 0, 7] },
      list: { fontSize: 10.5, margin: [12, 0, 0, 8] },
      footer: { fontSize: 8.5, color: "#6b7280" },
    },
    header: () => ({
      text: "Credit Regulator Pro - Admin Manual",
      style: "footer",
      alignment: "right",
      margin: [48, 24, 48, 0],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "Internal training use", style: "footer" },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", style: "footer" },
      ],
      margin: [48, 0, 48, 24],
    }),
  };
}

mkdirSync(outputDir, { recursive: true });

for (const [index, manual] of manuals.entries()) {
  const pdfBase64 = await generateServerPdf(docFor(manual));
  const filename = `${String(index + 1).padStart(2, "0")}-${manual.slug}.pdf`;
  writeFileSync(join(outputDir, filename), Buffer.from(pdfBase64, "base64"));
  console.log(filename);
}

console.log(`Generated ${manuals.length} admin manuals in ${outputDir}`);
