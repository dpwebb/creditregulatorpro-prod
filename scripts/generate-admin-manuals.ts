import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Content, StyleDictionary, TDocumentDefinitions } from "pdfmake/interfaces";
import { generateServerPdf } from "../helpers/pdfServerUtils";

type DetailRow = [string, string, string];

type Workflow = {
  title: string;
  summary: string;
  steps: string[];
  options?: string[];
  verification: string[];
};

type CommonTask = {
  title: string;
  example: string;
  procedure: string[];
  bestPractices: string[];
  verification: string[];
};

type Manual = {
  name: string;
  slug: string;
  route: string;
  group: "Platform" | "Legal & Rules" | "Tools";
  overview: string;
  purpose: string;
  screenshotFocus: string;
  mainPanels: DetailRow[];
  operatorNotes: string[];
  configurationScope: string[];
  workflows: Workflow[];
  commonTasks: CommonTask[];
  commonErrors: DetailRow[];
  troubleshooting: DetailRow[];
  bestPractices: string[];
  completionChecklist: string[];
  relatedPages: string[];
};

const outputDir = "docs/admin-manuals";
const screenshotDir = join(outputDir, "screenshots");
const generatedDate = "May 10, 2026";

const accessRequirements = [
  "Sign in with an account that has admin access. Support users may see some reference sections, but admin configuration and review tools require admin role.",
  "Use the intended environment. Local admin browser testing uses http://localhost:5175. The backend port, http://localhost:3333, is API-only.",
  "Treat screenshots, exports, logs, report text, and record IDs as internal test-environment material. Do not paste them into public channels.",
  "Confirm the page route, active filters, selected user, selected report, and selected environment before any save, delete, reset, dismissal, or finalize action.",
  "When an action affects customer-facing findings, packets, pricing, feature flags, or parser truth, record the reason and verify the downstream record after refresh.",
];

function workflow(
  title: string,
  summary: string,
  steps: string[],
  verification: string[] | undefined,
  options?: string[],
): Workflow {
  if (!verification && options) {
    return { title, summary, steps, verification: options };
  }

  return { title, summary, steps, verification: verification ?? [], options };
}

function task(
  title: string,
  example: string,
  procedure: string[],
  bestPractices: string[],
  verification: string[],
): CommonTask {
  return { title, example, procedure, bestPractices, verification };
}

function defaultErrors(subject: string): DetailRow[] {
  return [
    ["Access denied or redirected to login", "The session expired, the role is not admin, or the wrong environment is open.", "Sign back in, confirm admin role, and reopen the route from the sidebar instead of using an old bookmark."],
    ["Expected record is missing", "Search terms, tabs, filters, pagination, or environment selection are hiding the record.", "Clear filters, search by exact ID or email, verify the environment, and compare Activity Logs when available."],
    ["Save appears to do nothing", "Required fields are missing, there are no dirty changes, or the API returned a validation error.", "Read the inline validation text, correct one field at a time, save again, refresh, and check Error Logs if the state still does not persist."],
    [`${subject} state conflicts with another page`, "The source record was changed elsewhere or the current page is stale.", "Refresh the page, reopen the source record, and use timestamps or record IDs to decide which state is authoritative."],
  ];
}

function defaultTroubleshooting(subject: string): DetailRow[] {
  return [
    ["Start with a refresh", `A refresh confirms whether the ${subject} view is stale or whether the backend rejected the action.`, "Refresh once, then repeat the exact search or selection. Do not repeat destructive actions until the latest state is visible."],
    ["Check Activity Logs", "Successful admin actions should leave an audit trail for sensitive workflows.", "Search by actor, affected user, entity ID, route, or timestamp. Use the log entry as confirmation, not just the toast message."],
    ["Check Error Logs", "Repeated UI failures usually have matching server or API errors.", "Search around the action time. Capture the route, status, error summary, and request context for developer follow-up."],
    ["Escalate with evidence", "Developer review is faster when the exact record and reproduction path are known.", "Provide environment, route, selected filters, record ID, expected outcome, actual outcome, screenshot, and timestamp."],
  ];
}

function commonCompletion(subject: string): string[] {
  return [
    `The ${subject} page was reopened or refreshed after the change.`,
    "The expected saved state remained visible after refresh.",
    "Related logs, downstream records, or generated artifacts agree with the visible page state.",
    "Any customer-facing wording, finding status, packet state, or support note was reviewed for factual and neutral language.",
    "Any unresolved risk, failed test, suspicious log, or unclear source evidence was escalated with record IDs and screenshots.",
  ];
}

const manuals: Manual[] = [
  {
    name: "Home Dashboard",
    slug: "home-dashboard",
    route: "/",
    group: "Platform",
    overview: "The Home Dashboard is the admin starting point for platform operations. It summarizes current operational state and gives fast access to user management, risk triage, rule configuration, logs, version tools, and lifecycle testing.",
    purpose: "Use this page at the beginning and end of an admin session to orient work, choose the right queue, and verify that recent operations changed the broader platform state as expected.",
    screenshotFocus: "The screenshot shows the admin sidebar, platform scope banner, dashboard quick actions, activity widgets, and current admin identity.",
    mainPanels: [
      ["Admin quick actions", "Links to high-frequency admin work areas such as User Management, Risk Triage, Rule Check Settings, Activity Logs, Version Management, and Lifecycle Testing.", "Use these links instead of memorized URLs so you know the sidebar route is discoverable and active."],
      ["Sidebar navigation", "Groups platform, legal/rules, and tools sections.", "Use the search field to confirm a section exists before assuming a feature is missing."],
      ["Hidden risk widget", "Summarizes active compliance risk signals for admin review.", "Open Risk Triage for the source records before relying on counts alone."],
      ["Profile/session footer", "Shows the logged-in admin and system status.", "Confirm you are signed in as the intended admin before sensitive operations."],
    ],
    operatorNotes: [
      "Dashboard counts are orientation signals. They are not a substitute for opening the source queue and checking the record.",
      "Use the sidebar group labels to decide whether a task is operational, legal/reference, or tooling-related.",
      "When counts look stale after a save elsewhere, refresh the dashboard once and compare Activity Logs before retrying the action.",
    ],
    configurationScope: [
      "The dashboard does not directly change configuration. It routes admins to configuration sections.",
      "Do not infer that a workflow completed from a dashboard count alone. Verify on the source page.",
      "Use dashboard navigation to validate that newly added admin pages are discoverable in the expected group.",
    ],
    workflows: [
      workflow(
        "Start-of-shift platform review",
        "Use this procedure to decide which admin queues need attention before changing any records.",
        [
          "Open the Home Dashboard and confirm the platform scope banner shows the Canadian credit bureau compliance scope.",
          "Confirm the logged-in identity in the sidebar footer is the expected admin account.",
          "Scan the quick-action cards and hidden-risk summary for counts that indicate pending operational work.",
          "Open Risk Triage first if high-risk or needs-review counts are non-zero.",
          "Open Error Logs before changing settings if the dashboard or a queue looks incomplete.",
          "Use Activity Logs to review overnight admin actions before assuming no one else changed a record.",
        ],
        [
          "The target queue is identified before changes begin.",
          "Any stale or conflicting count has been checked against the source page.",
          "The first operational action is opened from the dashboard or sidebar, not from an old URL.",
        ],
      ),
      workflow(
        "End-of-shift confirmation",
        "Use this procedure to confirm that sensitive admin work actually persisted.",
        [
          "Return to the Home Dashboard after completing user, risk, parser, support, or configuration work.",
          "Refresh the page once to force a new read.",
          "Compare dashboard counts to the records you changed. A resolved risk should leave the active queue, and a new support item should remain visible in Support Tickets until closed.",
          "Open Activity Logs for the completed work and confirm the timestamp, actor, entity, and action type are present.",
          "If a count did not update, reopen the source page and check whether a filter or stale cache explains the mismatch.",
        ],
        [
          "Source page state, dashboard state, and Activity Logs do not conflict.",
          "Any mismatch is documented with screenshots and exact timestamps.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Choose the right admin tool",
        "Example: A support agent reports a user cannot see a dispute packet, while the dashboard also shows hidden risk findings.",
        [
          "Start on Home and identify whether the issue is a user/account problem, a compliance finding, a historical packet record, or the dispute reset boundary.",
          "Open User Management if the question is about role, subscription, login, user detail, or reset eligibility.",
          "Open Risk Triage if the question is about a high-risk compliance finding or source evidence.",
          "Open Parser Testing or Finding Corrections if the finding source or extraction truth is in question.",
          "Open Activity Logs last to confirm what was actually changed.",
        ],
        [
          "Do not jump directly to resetting user data when the issue may be a parser or packet state.",
          "Prefer the most specific source page for the record under review.",
        ],
        [
          "The selected tool contains the affected record.",
          "The record ID or user email is captured before further action.",
        ],
      ),
      task(
        "Confirm navigation coverage",
        "Example: After a staging repair, verify Security & Compliance is visible to admins.",
        [
          "Open the sidebar search field and type the expected section name.",
          "Confirm the route appears in the correct group.",
          "Open the page and wait for the body to load.",
          "Confirm the page does not show access denied, not found, or unauthorized text.",
          "Check whether the section also appears without search after clearing the search field.",
        ],
        [
          "Navigation visibility is part of operational readiness. A working URL is not enough if admins cannot discover it.",
          "Use exact labels from the sidebar when documenting route coverage.",
        ],
        [
          "The page loads from the sidebar.",
          "The route is visible in the intended group after clearing search.",
        ],
      ),
    ],
    commonErrors: defaultErrors("dashboard"),
    troubleshooting: defaultTroubleshooting("dashboard"),
    bestPractices: [
      "Begin risky work from Home so you can verify identity, scope, and environment.",
      "Treat dashboard totals as prompts to investigate, not as final operational evidence.",
      "Use the sidebar search field as the fastest way to locate admin tools during support calls.",
      "Document any dashboard/source-page mismatch with screenshots before rerunning sensitive actions.",
    ],
    completionChecklist: commonCompletion("dashboard"),
    relatedPages: ["Risk Triage", "User Management", "Activity Logs", "Error Logs", "Version Management", "Lifecycle Testing"],
  },
  {
    name: "User Management",
    slug: "user-management",
    route: "/admin-user-management",
    group: "Platform",
    overview: "User Management lists customer, support, and admin accounts with role, verification, usage, pagination, and actions. It is the control surface for account lookup, support-agent creation, user detail review, and approved data reset workflows.",
    purpose: "Use this section to find the exact account under review, confirm role and account state, open user detail, create support agents, and reset derived user data only when a documented repair case requires it.",
    screenshotFocus: "The screenshot shows search, role filters, user cards, account statistics, actions, and pagination.",
    mainPanels: [
      ["Search and role filter", "Narrows the list by name/email and role.", "Search by exact email before resetting or reviewing a sensitive user."],
      ["User cards", "Show display name, email, role badge, verification icon, join date, and counts for tradelines, packets, and evidence.", "Use counts to decide whether reset or detail review may affect substantial data."],
      ["Actions menu", "Opens details or starts reset for non-admin users.", "Admin self-reset and self-delete protections must remain respected."],
      ["Add Support Agent", "Creates an internal support role with email, display name, and temporary password.", "Use only with approved staffing requests and communicate credentials through approved internal channels."],
      ["Pagination", "Shows the visible range and total user count.", "Use next/previous before concluding a user is absent."],
    ],
    operatorNotes: [
      "Never reset user data from a vague request. The request must identify the exact user and reason.",
      "Support-agent accounts bypass user subscription checks but do not receive full admin capabilities.",
      "A user card count is a warning about blast radius. Open detail before destructive operations.",
    ],
    configurationScope: [
      "Creating support agents changes authentication and support access state.",
      "Reset User Data deletes derived credit-report data for the selected user while leaving the account intact.",
      "Role changes are not performed from the visible list page. Do not improvise role changes outside approved admin workflows.",
    ],
    workflows: [
      workflow(
        "Find and verify a user account",
        "Use this before support, reset, packet, or compliance review work.",
        [
          "Open User Management from the Platform sidebar group.",
          "Search by the exact email address from the support ticket or operational request.",
          "If no result appears, clear the role filter and retry with a partial display name.",
          "Confirm display name, email, role badge, verification icon, join date, and usage counts.",
          "Open View Details for the account and compare the detail page to the original request.",
          "Record the user ID and email in the internal work note before performing a mutation.",
        ],
        [
          "The selected user matches the request by email and ID.",
          "The role is understood before the next action.",
          "The action path is documented in the support or admin note.",
        ],
      ),
      workflow(
        "Reset user data for an approved repair",
        "Use only when the user's derived report, tradeline, packet, evidence, or freeze data must be removed and rebuilt.",
        [
          "Confirm the repair approval, affected environment, user email, and reason outside the UI.",
          "Search by exact email and confirm the visible card is not an admin account.",
          "Open the actions menu and choose Reset User Data.",
          "Read the destructive-action dialog. Confirm it refers to reports and derived data, not the user account itself.",
          "Type the user's exact email into the confirmation field. Do not paste a different user's email from a clipboard history.",
          "Click Reset only once and wait for the success or failure message.",
          "Refresh User Management and confirm the affected counts changed as expected.",
          "Open Activity Logs and verify the reset audit entry includes the actor, user, and timestamp.",
        ],
        [
          "Reset dialog cancel: use when approval or identity is uncertain.",
          "Reset confirm: use only after exact email confirmation and documented approval.",
          "Escalate: use when counts do not match expected deletion totals or Error Logs show partial failure.",
        ],
        [
          "User account still exists.",
          "Derived data counts reflect the reset.",
          "Activity Logs show the reset action.",
          "No unrelated admin or support account was affected.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Create a support agent",
        "Example: Operations approves a new contractor to handle assigned support tickets.",
        [
          "Click Add Support Agent.",
          "Enter the approved work email address and display name.",
          "Enter a temporary password that complies with the internal credential handoff process.",
          "Submit the form and wait for the success message.",
          "Search for the new email and confirm the role badge is support.",
          "Have the support agent sign in and change any temporary credential if the operating process requires it.",
        ],
        [
          "Do not create support accounts for customers.",
          "Do not share temporary passwords in tickets, public chats, screenshots, or documentation.",
          "Use a work-controlled email, not a personal address, unless approved.",
        ],
        [
          "The new account appears in the support role filter.",
          "The account can access support/reference routes but not admin-only configuration routes.",
        ],
      ),
      task(
        "Investigate a packet-count mismatch",
        "Example: A user says a packet was created, but their card shows zero packets.",
        [
          "Search the exact user email and record the visible packet count.",
          "Open user detail to review related reports, tradelines, and packet records.",
          "Open Activity Logs and search around the reported packet creation time.",
          "Open Error Logs if the activity trail shows a failed packet save or export.",
          "If a hidden-risk finding blocks dispute readiness, open Risk Triage or the relevant tradeline detail.",
        ],
        [
          "Use count mismatches as a starting point, not proof that a packet is missing.",
          "Distinguish historical packet viewing, packet download, and packet delivery events.",
        ],
        [
          "The packet state is verified on the source page.",
          "Any failure path has a matching log or a documented absence of logs.",
        ],
      ),
    ],
    commonErrors: defaultErrors("user management"),
    troubleshooting: defaultTroubleshooting("user management"),
    bestPractices: [
      "Search by exact email for sensitive actions.",
      "Open user detail before reset when the card shows any report, tradeline, packet, or evidence counts.",
      "Use support-agent creation only for approved internal staffing.",
      "Capture reset result counts in the operational note.",
    ],
    completionChecklist: commonCompletion("user management"),
    relatedPages: ["User detail", "Support Tickets", "Activity Logs", "Error Logs", "Risk Triage"],
  },
  {
    name: "Risk Triage",
    slug: "risk-triage",
    route: "/admin-risk-triage",
    group: "Platform",
    overview: "Risk Triage is the active queue for hidden-risk compliance findings detected from uploaded credit report tradelines. These findings are not server errors; they are possible consumer-reporting issues that require evidence-first review.",
    purpose: "Use this section to review high-risk findings, open the affected user or account, preview the finding with AI assistance, route source defects to Finding Corrections, or mark a finding false positive when source evidence does not support it.",
    screenshotFocus: "The screenshot shows aggregate risk counts, the risk queue, affected user/account context, evidence status, and action buttons.",
    mainPanels: [
      ["Explanation panel", "Clarifies that queue items are compliance findings, not application errors.", "Use this distinction when deciding whether to open Error Logs or Finding Corrections."],
      ["Summary cards", "Show unresolved risk findings, affected users, high-risk findings, and needs-review counts.", "Prioritize high-risk and stale findings first."],
      ["Search toolbar", "Filters by finding ID, user, creditor, bureau, account, or category.", "Search exact finding IDs from support or developer reports."],
      ["Risk queue", "Lists finding label, severity, user, account, evidence state, source run, and actions.", "Review the full row before choosing a resolution path."],
      ["Actions", "Open User, Account, AI Preview, Fix Source, or False Positive.", "Pick the action based on what is uncertain: user context, account context, source extraction, or validity."],
    ],
    operatorNotes: [
      "A high-risk label means manual review is urgent. It does not mean the finding is already legally confirmed.",
      "Use Fix Source when parser evidence or extraction data may be wrong. Use False Positive only when the source data is right but the finding should not stand.",
      "If a finding has no source run, preserve the finding ID, tradeline ID, user, and timestamp for developer investigation.",
    ],
    configurationScope: [
      "False Positive changes the active finding state by dismissing it from the queue.",
      "Fix Source routes to the admin truth layer inside Parser Testing and Finding Corrections.",
      "AI Preview is advisory only and must not replace source evidence review.",
    ],
    workflows: [
      workflow(
        "Review a high-risk item end to end",
        "This is the detailed procedure behind the simple instruction 'Review high-risk items.'",
        [
          "Open Risk Triage and sort your attention by severity, age, and affected user impact.",
          "Search the finding ID when the work came from a ticket, log entry, or developer note.",
          "Read the finding label, category, and severity. Confirm whether it is a stale-reporting, timing, bankruptcy, identity, balance, or source-document issue.",
          "Confirm the affected user and account. If user identity or account ownership is unclear, click User or Account before resolving the finding.",
          "Read the Evidence column. If a packet already exists, treat the finding as higher operational risk because customer-facing materials may have been generated.",
          "If the source run exists, click Fix Source to inspect machine extraction, admin correction state, evidence, and regulation mapping.",
          "If the source run is absent, do not dismiss blindly. Capture the row, finding ID, tradeline ID, report artifact ID if visible, and timestamp for escalation.",
          "Decide the outcome: confirm/correct in Finding Corrections, mark false positive, or leave unresolved with an internal note for further review.",
          "Refresh the queue after action and confirm the item remains or leaves according to the decision.",
        ],
        [
          "User: open when role, subscription, account ownership, or reset history may explain the problem.",
          "Account: open when tradeline-level context, dispute reset status, dispute history, or account status matters.",
          "AI Preview: use for drafting a neutral internal summary, then verify facts in source records.",
          "Fix Source: use when parser fields, evidence excerpts, or regulation mapping may be wrong.",
          "False Positive: use only after source evidence shows the finding should not remain active.",
        ],
        [
          "The finding has a documented outcome.",
          "Dismissed findings leave the active queue after refresh.",
          "Corrected findings have saved admin correction records, evidence, and regulation status where applicable.",
        ],
      ),
      workflow(
        "Escalate a parser or rule defect",
        "Use this when the queue item is probably caused by wrong extraction, stale source data, or detector behavior.",
        [
          "Open the queue row and record finding ID, category, severity, creditor, bureau, account mask, tradeline ID, and extraction run ID.",
          "Click Fix Source and inspect the original extraction beside any saved admin correction.",
          "Check whether the field used by the detector is actually present in the source report.",
          "If a parser value is wrong, create or update the correction with exact source evidence and a parser instruction.",
          "If detector logic is wrong but extraction is right, document the detector category and why the rule should be adjusted.",
          "Do not mark false positive solely to clear the queue when a source defect should be repaired.",
        ],
        [
          "Parser correction: use for wrong/missing source fields.",
          "Rule configuration review: use for detector threshold or category behavior.",
          "Developer escalation: use for no source run, replay mismatch, or impossible UI state.",
        ],
        [
          "Escalation includes route, IDs, screenshot, source evidence, and desired behavior.",
          "The active queue state remains understandable to the next reviewer.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Mark a finding false positive",
        "Example: The queue flags stale reporting, but the source report shows a valid update date and no outdated status.",
        [
          "Open the affected Account and source correction page before dismissing.",
          "Verify that the source data is correctly parsed and the finding is unsupported.",
          "Return to Risk Triage and click False Positive for the exact row.",
          "Read the browser confirmation and confirm the finding ID matches the row under review.",
          "Accept the confirmation once. Wait for the success message.",
          "Refresh and confirm the row no longer appears in the active queue.",
          "Check Activity Logs for the dismissal entry.",
        ],
        [
          "False positive is not a parking lot for inconvenient findings.",
          "Never dismiss a finding because a customer does not like it. Dismiss only because evidence does not support it.",
          "If evidence is missing, use correction/escalation instead.",
        ],
        [
          "The finding is dismissed from the active queue.",
          "The reason is visible in audit context or the admin note trail.",
        ],
      ),
      task(
        "Use AI Preview safely",
        "Example: You need a short internal explanation before opening a support ticket reply.",
        [
          "Click AI Preview from the exact finding row.",
          "Ask for an internal summary of the finding, affected account, and review questions.",
          "Compare every factual statement against Risk Triage, Account, and Finding Corrections source data.",
          "Remove unsupported conclusions, legal advice, or customer-facing commitments.",
          "Use the verified summary only as an internal note or draft.",
        ],
        [
          "AI is assistance, not evidence.",
          "Do not paste secrets, reset links, or unrelated customer records into prompts.",
          "Keep customer-facing language neutral and evidence-based.",
        ],
        [
          "The final note cites the source record, not just the AI summary.",
          "Unsupported statements were removed before use.",
        ],
      ),
    ],
    commonErrors: defaultErrors("risk triage"),
    troubleshooting: defaultTroubleshooting("risk triage"),
    bestPractices: [
      "Review high-risk rows before warning rows.",
      "Open source evidence before using False Positive.",
      "Use Fix Source when the question is data quality, parser truth, or regulation mapping.",
      "Record finding IDs, tradeline IDs, and extraction run IDs in escalation notes.",
    ],
    completionChecklist: commonCompletion("risk triage"),
    relatedPages: ["Finding Corrections", "Parser Testing", "Rule Check Settings", "Admin AI Assist", "Activity Logs", "Error Logs"],
  },
  {
    name: "Rule Check Settings",
    slug: "rule-check-settings",
    route: "/admin-compliance-config",
    group: "Platform",
    overview: "Rule Check Settings controls compliance detector enablement, confidence thresholds, user-facing alert messaging, postal pricing settings, revenue summaries, and limited app settings such as production mode.",
    purpose: "Use this page to tune detection sensitivity and operational settings under change control. Changes can affect findings, user explanations, packet economics, and paid-plan availability.",
    screenshotFocus: "The screenshot shows detector threshold cards, save/reset actions, and tabs for messaging, pricing, and app settings.",
    mainPanels: [
      ["Detection Thresholds", "Cards for each finding category with enable switches and confidence sliders.", "Change one category at a time and rerun regression checks after meaningful detector changes."],
      ["Alert Messaging", "Templates for user explanation and recommended action text.", "Keep wording factual, neutral, and supported by evidence."],
      ["Postal Pricing", "Registered and first-class mail cost inputs plus revenue summary.", "Validate numeric ranges and expected markup before saving."],
      ["App Settings", "Production mode switch for paid subscription availability.", "Treat as high impact and change only with approval."],
      ["Save and Reset", "Save persists dirty config; Reset discards unsaved changes.", "Use Reset if the page has been used for exploration and no approved change should persist."],
    ],
    operatorNotes: [
      "Thresholds affect what the detector considers actionable. A low threshold increases review volume and false positives; a high threshold can suppress real risks.",
      "Messaging changes may become customer-facing. Review wording as carefully as a template change.",
      "Postal pricing accepts only valid non-negative numeric values, and surcharge percentage is constrained to 0 through 100.",
    ],
    configurationScope: [
      "Enabled/disabled category state and confidence thresholds affect compliance detection behavior.",
      "Explanation and recommended-action templates affect customer-facing or admin-facing text generated for findings.",
      "Postal pricing changes can affect the amount charged to users for mail transactions.",
      "Production mode can enable paid plan purchase flows and must be treated as a controlled setting.",
    ],
    workflows: [
      workflow(
        "Adjust a detector threshold safely",
        "Use this when a category has too many unsupported findings or misses evidence-backed findings.",
        [
          "Open Detection Thresholds and identify the exact finding category by label.",
          "Review recent Risk Triage examples and parser correction outcomes before changing the slider.",
          "Change only the target category. Do not adjust multiple sliders in one pass unless the change request explicitly covers them.",
          "Move the confidence threshold in a small increment and note the previous value.",
          "Confirm the card shows dirty/unsaved state.",
          "Click Save All Changes and wait for completion.",
          "Refresh the page and confirm the saved value remains.",
          "Run parser/violation correction regression checks or targeted manual review for affected categories.",
        ],
        [
          "Raise threshold: use when valid source data is generating too many weak findings.",
          "Lower threshold: use when evidence-backed findings are repeatedly below threshold.",
          "Disable category: use only with explicit approval and a rollback plan.",
        ],
        [
          "Saved threshold persists after refresh.",
          "Risk Triage volume changes are expected and documented.",
          "Regression tests or targeted review do not show unacceptable new failures.",
        ],
      ),
      workflow(
        "Update user-facing alert wording",
        "Use this when the explanation or recommended action needs better clarity without changing detector logic.",
        [
          "Open Alert Messaging and expand the target category.",
          "Read the current User Explanation Template and Recommended Action Template.",
          "Edit wording to explain what was detected, what evidence supports it, and what the user should review next.",
          "Use approved variables only, such as account number, creditor name, or date drift where the template supports them.",
          "Avoid legal conclusions unless the platform has verified authority language for the category.",
          "Save the changes and refresh.",
          "Generate or inspect an affected finding to confirm the wording renders correctly.",
        ],
        [
          "Template edit: use for clarity and tone changes.",
          "Rule/detector change: use when wording cannot honestly describe what the detector does.",
          "Legal/reference review: use when the change introduces statutory language or jurisdiction-specific claims.",
        ],
        [
          "Template persists after refresh.",
          "Rendered wording is factual, neutral, and readable.",
          "No unsupported legal conclusion was introduced.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Change postal pricing",
        "Example: Operations updates the registered mail base cost after a vendor price change.",
        [
          "Open Postal Pricing.",
          "Enter the registered mail base cost in CAD using a non-negative number with cents if needed.",
          "Enter the surcharge percentage between 0 and 100.",
          "For first-class mail, enter the PostGrid base cost and review the displayed 15 percent markup result.",
          "Compare computed totals against the approved pricing request.",
          "Click Save Pricing and wait for the save to complete.",
          "Refresh and confirm the values and computed totals remain.",
        ],
        [
          "Do not enter currency symbols in numeric fields.",
          "Do not save exploratory pricing values.",
          "Keep a dated note of the approved cost source.",
        ],
        [
          "Saved values persist after refresh.",
          "Computed totals match the approved pricing note.",
          "No Error Logs entries appear for pricing validation.",
        ],
      ),
      task(
        "Handle unsaved changes",
        "Example: An admin moved a threshold while exploring but no approval exists.",
        [
          "Look for the unsaved indicator in the header and dirty card styling.",
          "If the change is not approved, click Reset.",
          "Confirm the browser reset prompt.",
          "Refresh the page and confirm the previous saved state is restored.",
          "If the change is approved, document the reason and click Save All Changes instead.",
        ],
        [
          "Reset before leaving a shared admin session idle.",
          "Save only after review and approval are clear.",
        ],
        [
          "No dirty cards remain.",
          "Saved values reflect the approved decision, or exploratory values are discarded.",
        ],
      ),
    ],
    commonErrors: defaultErrors("rule settings"),
    troubleshooting: defaultTroubleshooting("rule settings"),
    bestPractices: [
      "Change one detector category at a time.",
      "Pair rule changes with Risk Triage review and parser regression checks.",
      "Keep customer-facing wording cautious and evidence-based.",
      "Treat production mode as a controlled release switch.",
    ],
    completionChecklist: commonCompletion("rule settings"),
    relatedPages: ["Risk Triage", "Finding Corrections", "Parser Testing", "Activity Logs", "Error Logs", "Version Management"],
  },
  {
    name: "Activity Logs",
    slug: "activity-logs",
    route: "/admin-activity-logs",
    group: "Platform",
    overview: "Activity Logs show user and system actions across the platform. They are the primary audit trail for confirming who performed an action, what entity was affected, and when it happened.",
    purpose: "Use this section to verify sensitive changes, support investigations, reset workflows, settings updates, upload activity, historical packet activity, and admin review history.",
    screenshotFocus: "The screenshot shows log filters, tabular action records, actor/entity context, status, and timestamps.",
    mainPanels: [
      ["Filters", "Search or filter by actor, action, status, date, user, or entity context.", "Use exact IDs and timestamps from the source workflow when available."],
      ["Log table", "Displays action, actor, entity, result, and time.", "Use the table as evidence that an action happened or did not happen."],
      ["Pagination", "Moves through older records.", "Do not stop at the first page when reviewing older support claims."],
      ["Status/result fields", "Indicate whether the action succeeded or failed.", "Escalate successful-looking UI actions that have no successful activity entry."],
    ],
    operatorNotes: [
      "Activity Logs confirm actions. Error Logs explain failures. Use both when a save outcome is unclear.",
      "Timestamps are more useful when recorded with the environment and timezone context.",
      "Do not paste full logs into customer replies.",
    ],
    configurationScope: [
      "Activity Logs are read-only from the UI.",
      "They may expose test data, emails, IDs, and internal actions.",
      "Use logs to support decisions, not to change state directly.",
    ],
    workflows: [
      workflow(
        "Confirm a sensitive admin action",
        "Use this after resets, support-agent creation, rule changes, false-positive dismissal, finalization, or feature flag changes.",
        [
          "Open Activity Logs immediately after the source workflow completes.",
          "Search by affected user email, entity ID, or action name.",
          "Narrow by timestamp if the result set is large.",
          "Confirm the actor is the expected admin account.",
          "Confirm the entity matches the source record, not a similarly named user or account.",
          "Record the timestamp and action result in the internal note.",
          "If the log is missing, refresh once and then check Error Logs before retrying the source action.",
        ],
        [
          "Successful action: use as confirmation after source page refresh.",
          "Failed action: open Error Logs and do not assume the source workflow completed.",
          "Missing action: treat as unresolved until source state and logs agree.",
        ],
        [
          "Log entry exists with expected actor, entity, action, and timestamp.",
          "The source page state matches the log result.",
        ],
      ),
      workflow(
        "Trace a support claim",
        "Use when a user or support agent says something happened but the source page is ambiguous.",
        [
          "Collect the reported user email, action, approximate time, and route from the ticket.",
          "Search Activity Logs by exact email or user ID.",
          "Review nearby actions before and after the reported event.",
          "Open the related source page in a separate tab if the log identifies an entity.",
          "If a failure is implied, search Error Logs in the same time window.",
          "Summarize facts neutrally: observed action, actor, time, and current source state.",
        ],
        undefined,
        [
          "The support note distinguishes observed logs from user-reported events.",
          "Any gap or missing action is marked unresolved rather than guessed.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Verify a reset",
        "Example: User Management reported that report artifacts and tradelines were deleted.",
        [
          "Search Activity Logs by the affected user email.",
          "Find the reset action around the time of the User Management success message.",
          "Confirm the actor is the admin who performed the reset.",
          "Open User Management and confirm the derived data counts now match the reset outcome.",
          "If the log is absent, check Error Logs and do not run reset again until state is understood.",
        ],
        [
          "Use reset result counts from the success message and logs together.",
          "Avoid a second reset attempt when the first result is ambiguous.",
        ],
        [
          "Reset action has a successful audit record.",
          "Derived counts changed as expected.",
        ],
      ),
      task(
        "Audit a settings change",
        "Example: A detector threshold changed and Risk Triage volume shifted.",
        [
          "Search Activity Logs for rule or system setting update actions.",
          "Confirm the action timestamp aligns with the observed queue change.",
          "Open Rule Check Settings and verify the current saved value.",
          "Review Error Logs for failed validation messages around the same time.",
          "Document whether the volume shift is explained by a deliberate settings change.",
        ],
        [
          "Always verify current config in the source settings page.",
          "Do not rely only on a log description when exact current values matter.",
        ],
        [
          "The settings source page and audit log agree.",
          "Any unexpected change is escalated with actor and timestamp.",
        ],
      ),
    ],
    commonErrors: defaultErrors("activity logs"),
    troubleshooting: defaultTroubleshooting("activity logs"),
    bestPractices: [
      "Use exact emails, IDs, and timestamps.",
      "Keep log summaries factual and concise.",
      "Pair Activity Logs with source page refresh and Error Logs for ambiguous saves.",
      "Never expose internal log detail to customers unless an approved customer-safe summary is prepared.",
    ],
    completionChecklist: commonCompletion("activity logs"),
    relatedPages: ["Error Logs", "User Management", "Rule Check Settings", "Risk Triage", "Support Tickets"],
  },
  {
    name: "Error Logs",
    slug: "error-logs",
    route: "/admin-error-logs",
    group: "Platform",
    overview: "Error Logs list application errors and failed operations that need operational review. They help diagnose failed saves, parser failures, API problems, import/export issues, and unexpected UI states.",
    purpose: "Use this section when the UI shows a failure, a save does not persist, a parser test fails unexpectedly, or support reports an operation that cannot be confirmed through Activity Logs.",
    screenshotFocus: "The screenshot shows error filters, severity/status fields, message context, route/API context, and timestamps.",
    mainPanels: [
      ["Severity filters", "Separate critical errors, warnings, and informational failures.", "Prioritize repeated critical errors and user-blocking failures."],
      ["Search", "Finds messages by action, route, user, or error text.", "Use exact route or endpoint names from the failing workflow."],
      ["Error rows", "Show message, context, user/actor when available, time, and status.", "Do not copy stack traces to customers."],
      ["Context fields", "Help identify the page, endpoint, or entity involved.", "Capture these fields for developer escalation."],
    ],
    operatorNotes: [
      "A single error may not mean the workflow failed if a retry later succeeded. Compare Activity Logs and source state.",
      "Repeated critical errors across users usually need developer attention.",
      "Parser and PDF extraction failures often require source PDF, test case ID, replay hash, and route context.",
    ],
    configurationScope: [
      "Error Logs are read-only from the UI.",
      "They can reveal internal endpoints, stack context, and test data.",
      "Use them for diagnosis and escalation, not customer messaging.",
    ],
    workflows: [
      workflow(
        "Investigate a failed save",
        "Use this when a form reports failure or saved values disappear after refresh.",
        [
          "Record the route, approximate time, actor, and entity ID from the source page.",
          "Open Error Logs and search by route, endpoint, or action name.",
          "Filter to the time window around the failed save.",
          "Read the validation or error message and identify whether it is user-correctable or developer-facing.",
          "Return to the source page and correct required fields if the error is validation-related.",
          "If the error is server, database, permission, or unexpected exception, do not retry repeatedly. Escalate with context.",
        ],
        [
          "Validation error: correct input and retry once.",
          "Permission error: confirm role and environment.",
          "Server exception: capture details and escalate.",
        ],
        [
          "A retry succeeds and Activity Logs confirm it, or escalation includes exact error context.",
        ],
      ),
      workflow(
        "Review parser/PDF extraction failures",
        "Use when Parser Testing, upload, Stage Lab, or Finding Corrections fails unexpectedly.",
        [
          "Search Error Logs by parser, extraction, PDF, upload, test case, or endpoint name.",
          "Record test case ID, extraction run ID, source artifact ID, and timestamp if available.",
          "Open Parser Testing and confirm whether the test case or Stage Lab result still exists.",
          "Check whether the error is input-file related, deterministic replay related, or storage related.",
          "Export the affected test case if possible before making changes.",
          "Escalate with source PDF/test case reference, replay hash when available, and the error row context.",
        ],
        undefined,
        [
          "The affected parser artifact is preserved when possible.",
          "The escalation contains enough context to reproduce the failure.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Separate user-correctable errors from defects",
        "Example: A pricing save fails because the surcharge value is out of range.",
        [
          "Open the relevant error row.",
          "Look for validation language such as missing required field, invalid number, out of range, or unauthorized.",
          "If validation is clear, correct the source form and retry once.",
          "If the message indicates exception, database, undefined field, or failed invariant, stop and escalate.",
        ],
        [
          "Do not treat repeated validation errors as system defects until the input has been corrected.",
          "Do not expose stack traces or internal endpoint names to customers.",
        ],
        [
          "Correctable issues are resolved in the source page.",
          "Defects are escalated with exact error context.",
        ],
      ),
      task(
        "Document a recurring critical error",
        "Example: Multiple users hit the same packet export failure.",
        [
          "Filter to critical errors and search for the packet/export endpoint or message.",
          "Count how many distinct users or artifacts are affected.",
          "Collect first seen, latest seen, route, status, and repeated message pattern.",
          "Open Activity Logs to see whether any later retry succeeded.",
          "Escalate with the pattern summary and affected IDs.",
        ],
        [
          "Prioritize repeated user-blocking errors over isolated transient messages.",
          "Summarize patterns rather than pasting full logs.",
        ],
        [
          "The escalation includes impact, frequency, and reproduction route.",
        ],
      ),
    ],
    commonErrors: defaultErrors("error logs"),
    troubleshooting: defaultTroubleshooting("error logs"),
    bestPractices: [
      "Start with source route and timestamp.",
      "Use Error Logs with Activity Logs to distinguish failed and successful retries.",
      "Escalate repeated critical errors quickly.",
      "Never send raw stack traces to users.",
    ],
    completionChecklist: commonCompletion("error logs"),
    relatedPages: ["Activity Logs", "Parser Testing", "Rule Check Settings", "User Management", "Support Tickets"],
  },
  {
    name: "Security & Compliance",
    slug: "security-compliance",
    route: "/admin-security",
    group: "Platform",
    overview: "Security & Compliance contains audit-log review, retention controls, and semantic audit tools. It helps admins verify compliance controls, retention posture, and policy-sensitive content.",
    purpose: "Use this page for compliance oversight, retention review, and targeted semantic audit checks under approved scope.",
    screenshotFocus: "The screenshot shows the Security & Compliance page tabs and available security/compliance tools.",
    mainPanels: [
      ["Audit Logs", "Security-oriented view of recorded actions and access events.", "Use for security investigations and control verification."],
      ["Data Retention", "Retention status and enforcement controls.", "Treat retention enforcement as destructive and verify scope carefully."],
      ["Semantic Audit", "Policy-sensitive content scanning tools.", "Run only on approved scope and review results before exporting."],
    ],
    operatorNotes: [
      "Retention workflows can delete or alter data availability. Do not run them casually.",
      "Semantic audit results can contain sensitive context. Store exports only in approved internal locations.",
      "Security review should use least necessary scope.",
    ],
    configurationScope: [
      "Retention controls may affect stored data lifecycle.",
      "Semantic audit configuration and exports may affect compliance evidence.",
      "This page should remain discoverable from the admin sidebar for operational readiness.",
    ],
    workflows: [
      workflow(
        "Review audit history",
        "Use when verifying security-sensitive actions or investigating access concerns.",
        [
          "Open Security & Compliance from the Platform sidebar group.",
          "Select Audit Logs.",
          "Narrow by user, action, entity, or date range.",
          "Read actor, target, timestamp, result, and context fields.",
          "Compare with Activity Logs if the event also changed application state.",
          "Record a customer-safe summary only if a support response requires it.",
        ],
        undefined,
        [
          "The event is confirmed or documented as absent.",
          "Any suspicious access pattern is escalated with timestamp and actor details.",
        ],
      ),
      workflow(
        "Run a retention review",
        "Use when operations asks whether data is eligible for retention cleanup.",
        [
          "Open Data Retention and read the current retention status before taking action.",
          "Confirm the approved scope: environment, data class, date range, and user population.",
          "Run read-only review or preview first where available.",
          "Record counts and affected categories before enforcement.",
          "Do not enforce retention if the scope, approval, or expected outcome is unclear.",
          "After enforcement, refresh and verify counts and logs.",
        ],
        [
          "Preview/review: preferred first step.",
          "Enforce: use only with explicit approval.",
          "Escalate: use when counts are unexpectedly high or include protected test cases.",
        ],
        [
          "Retention outcome matches approved scope.",
          "Activity/audit logs confirm the action.",
          "No out-of-scope data was affected.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Run a semantic audit check",
        "Example: Compliance asks whether support notes include policy-sensitive wording.",
        [
          "Confirm the approved record set and purpose.",
          "Open Semantic Audit.",
          "Run the smallest scope that answers the question.",
          "Review flagged items manually before treating them as violations.",
          "Export results only if required and store them in approved internal storage.",
        ],
        [
          "Use semantic audit as a detection aid, not automatic discipline or legal judgment.",
          "Avoid broad scans when a targeted search is enough.",
        ],
        [
          "Flagged records were reviewed by a human.",
          "Export handling follows internal storage rules.",
        ],
      ),
      task(
        "Verify sidebar access after security changes",
        "Example: A route repair claims Security & Compliance is now visible.",
        [
          "Open the admin sidebar.",
          "Search for Security & Compliance.",
          "Open the route and confirm the page content loads.",
          "Sign in with a non-admin/support account in a separate test only if route permissions are under review.",
          "Confirm unauthorized roles cannot access admin-only functions.",
        ],
        [
          "Visibility and authorization are separate checks.",
          "Never test admin controls with a real customer account.",
        ],
        [
          "Admin can discover and open the section.",
          "Non-admin access remains blocked where expected.",
        ],
      ),
    ],
    commonErrors: defaultErrors("security and compliance"),
    troubleshooting: defaultTroubleshooting("security and compliance"),
    bestPractices: [
      "Use least necessary scope for audit and retention work.",
      "Treat retention enforcement as destructive.",
      "Protect semantic audit exports.",
      "Escalate suspicious access patterns with factual evidence only.",
    ],
    completionChecklist: commonCompletion("security and compliance"),
    relatedPages: ["Activity Logs", "Error Logs", "User Management", "Support Tickets"],
  },
  {
    name: "Support Tickets",
    slug: "support-tickets",
    route: "/support-tickets",
    group: "Platform",
    overview: "Support Tickets organizes customer and internal support requests with priority, status, assignment, conversation, and account context.",
    purpose: "Use this section to triage support issues, verify related platform records, document completed actions, and close tickets only when the issue is resolved.",
    screenshotFocus: "The screenshot shows support ticket filters, list/detail entry points, status/priority labels, and ticket context.",
    mainPanels: [
      ["Ticket list", "Displays open, assigned, unassigned, and historical tickets.", "Start with priority and age, then verify user/account context."],
      ["Filters", "Narrow by status, priority, category, or assignment.", "Clear filters before concluding the queue is empty."],
      ["Ticket detail", "Shows conversation, account context, and internal notes.", "Keep replies customer-safe and avoid internal stack traces."],
      ["Assignment/status actions", "Move work to the correct support owner and lifecycle state.", "Close only after verification is complete."],
    ],
    operatorNotes: [
      "Support notes should distinguish user-reported statements from admin-verified facts.",
      "Use User Management, Activity Logs, Error Logs, Risk Triage, or Parser Testing to verify facts before replying.",
      "Do not promise legal outcomes or unsupported credit-reporting results.",
    ],
    configurationScope: [
      "Ticket state changes affect support workflow and may notify or inform users depending on implementation.",
      "Internal notes should remain internal and customer-safe.",
      "Ticket closure is an operational decision, not proof the underlying defect is repaired unless verified.",
    ],
    workflows: [
      workflow(
        "Triage a new ticket",
        "Use when a ticket arrives or is assigned to admin/support review.",
        [
          "Open Support Tickets and clear filters if the expected ticket is not visible.",
          "Read subject, category, priority, status, requester, and age.",
          "Open the ticket detail and identify the requested outcome.",
          "Search User Management by exact email if the ticket concerns account access, reports, or packets.",
          "Open Activity Logs and Error Logs when the ticket describes a failed action.",
          "Set or confirm assignment and update status according to the work state.",
          "Write an internal note with verified facts and next action.",
        ],
        [
          "Assign: use when a named owner will continue work.",
          "Pending/internal review: use when waiting on admin, developer, or compliance review.",
          "Close: use only after the issue is resolved or accurately answered.",
        ],
        [
          "Ticket has a clear owner/status.",
          "Internal notes identify verified facts and unresolved items.",
        ],
      ),
      workflow(
        "Prepare a customer-safe reply",
        "Use after source records have been reviewed.",
        [
          "Read the latest customer message and determine the exact question.",
          "Verify facts in source pages. Do not rely on memory or dashboard counts.",
          "Translate internal findings into plain language without stack traces, endpoint names, private IDs, or unsupported legal conclusions.",
          "State what was reviewed, what was changed if anything, and what the user should do next.",
          "If the issue is still under investigation, say what is being investigated and avoid promising a timeline unless approved.",
        ],
        undefined,
        [
          "Reply is factual, neutral, and free of internal-only details.",
          "Ticket status matches the next action.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Escalate a technical support issue",
        "Example: A user cannot download a packet and Error Logs show a server exception.",
        [
          "Open the ticket and record requester, route, time, and described behavior.",
          "Open Error Logs and capture the error summary, endpoint/route, status, and timestamp.",
          "Open Activity Logs to check whether any later retry succeeded.",
          "Add an internal note with reproduction details and affected IDs.",
          "Assign or tag the ticket for developer/admin follow-up according to the local process.",
        ],
        [
          "Do not send raw stack traces to the user.",
          "Do not mark closed while the underlying issue is still active.",
        ],
        [
          "Escalation contains reproduction path and log context.",
          "Ticket status communicates that work is pending.",
        ],
      ),
      task(
        "Close a resolved ticket",
        "Example: A support agent confirms a user can now access the corrected report.",
        [
          "Verify the resolved state in the source page.",
          "Add a final internal note describing the action taken and evidence checked.",
          "Send a customer-safe reply if customer communication is required.",
          "Set the ticket to closed/resolved.",
          "Refresh the ticket list and confirm it no longer appears in open filters.",
        ],
        [
          "Close for completed support outcomes, not for work transferred elsewhere.",
          "If a defect remains open, use pending/escalated state instead.",
        ],
        [
          "The source issue is resolved or accurately answered.",
          "Ticket status and notes match the outcome.",
        ],
      ),
    ],
    commonErrors: defaultErrors("support tickets"),
    troubleshooting: defaultTroubleshooting("support tickets"),
    bestPractices: [
      "Verify before replying.",
      "Separate internal notes from customer-facing language.",
      "Use exact user email and ticket ID in admin notes.",
      "Close only when the support outcome is complete.",
    ],
    completionChecklist: commonCompletion("support tickets"),
    relatedPages: ["User Management", "Activity Logs", "Error Logs", "Risk Triage", "Admin AI Assist"],
  },
  {
    name: "Admin Guide",
    slug: "admin-guide",
    route: "/admin-knowledge-base",
    group: "Platform",
    overview: "Admin Guide is the internal knowledge base for platform operations, user support, compliance workflows, parser testing, version management, and reference procedures.",
    purpose: "Use this page when you need operating guidance before changing settings, running sensitive tools, or answering support questions.",
    screenshotFocus: "The screenshot shows knowledge-base sections, guide navigation, and export/download affordances.",
    mainPanels: [
      ["Knowledge sections", "Organize internal documentation by operating area.", "Open the relevant section before using a workflow you do not perform regularly."],
      ["Admin procedures", "Explain user, compliance, parser, support, and version workflows.", "Use as the first stop for policy or workflow uncertainty."],
      ["PDF/export controls", "Allow portable reference material where available.", "Export only current internal materials and keep them in approved storage."],
    ],
    operatorNotes: [
      "The guide is reference material. Source pages and logs remain authoritative for live records.",
      "If the guide conflicts with current UI behavior, record the mismatch and update documentation.",
      "Do not add secrets, private keys, tokens, reset links, or production credentials to guide content.",
    ],
    configurationScope: [
      "The page itself is mostly reference content.",
      "Exported guides can become stale and should be regenerated after material UI or workflow changes.",
      "Documentation updates must reflect current admin navigation and controlled operations.",
    ],
    workflows: [
      workflow(
        "Use the guide before a sensitive workflow",
        "Use when preparing for resets, retention, parser correction, rule changes, production mode, or support escalation.",
        [
          "Open Admin Guide.",
          "Find the section matching the workflow area.",
          "Read the prerequisites, cautions, and completion criteria before opening the source page.",
          "Open the source admin route in a new tab or from the sidebar.",
          "Perform the action using the source page and verify through logs.",
          "Return to the guide if an unexpected option appears or the source page has changed.",
        ],
        undefined,
        [
          "The workflow was completed using current source UI.",
          "Any guide/source mismatch was captured for documentation repair.",
        ],
      ),
      workflow(
        "Report outdated documentation",
        "Use when the Admin Guide no longer matches the UI or operating practice.",
        [
          "Capture the guide section title and the route it describes.",
          "Capture a screenshot of the current UI state that differs from the guide.",
          "Describe the expected correction in one or two factual sentences.",
          "Check whether the generator or source component owns the content.",
          "Create an internal follow-up or documentation update request with route and section references.",
        ],
        undefined,
        [
          "The mismatch is reproducible and clearly described.",
          "The correction target is identified.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Find escalation guidance",
        "Example: You are unsure whether a parser finding should be corrected, rejected, or escalated.",
        [
          "Open Admin Guide and search or scan for parser testing/finding correction content.",
          "Read the action definitions and evidence requirements.",
          "Open Finding Corrections and compare the live record to the documented requirements.",
          "If requirements are incomplete, stop before finalizing and escalate.",
        ],
        [
          "Do not finalize corrections based on incomplete documentation alone.",
          "Prefer evidence and source record checks over memory.",
        ],
        [
          "The selected action is supported by guide instructions and source evidence.",
        ],
      ),
      task(
        "Export a guide for internal training",
        "Example: Operations needs a current PDF for new admin onboarding.",
        [
          "Open the guide or sidebar export control.",
          "Generate the current PDF.",
          "Open the generated file and confirm date, title, and visible sections.",
          "Store it only in approved internal training storage.",
          "Regenerate after major UI, workflow, or policy changes.",
        ],
        [
          "Use current PDFs only.",
          "Do not distribute internal manuals outside approved channels.",
        ],
        [
          "The export opens and contains the expected current sections.",
        ],
      ),
    ],
    commonErrors: defaultErrors("admin guide"),
    troubleshooting: defaultTroubleshooting("admin guide"),
    bestPractices: [
      "Read guidance before high-impact workflows.",
      "Keep documentation current with route labels and button text.",
      "Use exported manuals as internal training aids only.",
      "Never store secrets in documentation.",
    ],
    completionChecklist: commonCompletion("admin guide"),
    relatedPages: ["Platform Functions PDF", "Parser Testing", "Finding Corrections", "Version Management", "Security & Compliance"],
  },
  {
    name: "Dispute Process Reset",
    slug: "dispute-process-reset",
    route: "/admin-letter-templates",
    group: "Platform",
    overview: "The legacy letter-template workspace is disabled while dispute packet and letter creation are redesigned.",
    purpose: "Use this reset page as a guardrail only. Do not edit legacy templates or rely on old packet wording during the redesign.",
    screenshotFocus: "The screenshot shows the reset notice that replaced the retired template management workspace.",
    mainPanels: [
      ["Reset notice", "Explains that legacy template editing has been retired.", "Use this page to confirm the old workflow is intentionally unavailable."],
      ["Redesign status", "Indicates that new dispute packet architecture is pending.", "Route packet wording changes through the redesign plan instead of the old template tools."],
    ],
    operatorNotes: [
      "Do not create, edit, seed, humanize, roll back, or preview legacy letter templates during the reset.",
      "Historical packets can still be viewed through packet history where available.",
      "New packet wording must wait for the approved dispute process architecture.",
    ],
    configurationScope: [
      "The reset disables active template management, not historical packet evidence.",
      "Future wording rules should be modeled in the new dispute process design rather than the legacy template tables.",
    ],
    workflows: [
      workflow(
        "Confirm legacy template tooling is unavailable",
        "Use when an operator asks why template editing cannot be used.",
        [
          "Open the reset page.",
          "Confirm the page states that dispute packet and letter creation are being redesigned.",
          "Do not attempt to seed or edit legacy templates.",
          "Record the requested wording change as an input to the redesign backlog.",
        ],
        [
          "Urgent typo in a historical packet: do not alter the historical artifact; escalate for support handling.",
          "New wording request: route to the dispute process redesign plan.",
        ],
        [
          "Legacy template editing remains unavailable.",
          "The requested change is tracked outside the retired template workflow.",
        ],
      ),
      workflow(
        "Route a packet wording request",
        "Use when support or operations requests new dispute letter language during the reset.",
        [
          "Capture the exact requested wording change.",
          "Capture the reason, affected dispute scenario, and evidence requirements.",
          "Add it to the redesign backlog for packet intent, evidence, and letter composition rules.",
          "Do not implement it through retired template endpoints.",
        ],
        undefined,
        [
          "Request includes scenario, evidence source, and intended recipient.",
          "No legacy template mutation occurred.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Explain why old template controls are gone",
        "Example: An admin expects to edit letter wording in the old screen.",
        [
          "Confirm the reset page is visible.",
          "Explain that the old letter builder was retired to prevent conflicting packet logic.",
          "Collect the desired wording or behavior as redesign input.",
        ],
        [
          "Do not bypass the reset through scripts or direct database edits.",
          "Do not promise that old template behavior will return.",
        ],
        [
          "The admin understands the reset boundary.",
          "The request is captured for the new architecture.",
        ],
      ),
      task(
        "Track a redesign requirement",
        "Example: A dispute letter needs a clearer consumer statement.",
        [
          "Document the user goal and recipient.",
          "List required evidence inputs.",
          "Identify whether the requirement affects packet selection, letter composition, delivery, or follow-up.",
          "Add it to the dispute process redesign plan.",
        ],
        [
          "Keep requirements separate from implementation assumptions.",
          "Prefer scenario-based acceptance criteria.",
        ],
        [
          "Requirement is ready to map into the new architecture.",
        ],
      ),
    ],
    commonErrors: defaultErrors("dispute process reset"),
    troubleshooting: defaultTroubleshooting("dispute process reset"),
    bestPractices: [
      "Keep the reset boundary clear.",
      "Preserve historical packet evidence.",
      "Route new wording and generation behavior through the redesign plan.",
      "Avoid direct edits to legacy template data.",
    ],
    completionChecklist: commonCompletion("dispute process reset"),
    relatedPages: ["Admin Guide", "Rule Check Settings", "Risk Triage", "Activity Logs"],
  },
  {
    name: "Credit Reporting Companies",
    slug: "credit-reporting-companies",
    route: "/bureaus",
    group: "Legal & Rules",
    overview: "Credit Reporting Companies stores reference information about bureaus and reporting companies used by platform workflows.",
    purpose: "Use this section to confirm bureau names, addresses, contact details, and operational context before evidence review, historical packet review, delivery support, or reference updates.",
    screenshotFocus: "The screenshot shows bureau/reference records and fields used for operational confirmation.",
    mainPanels: [
      ["Reference list", "Shows available credit reporting company records.", "Find the company before relying on address or contact data."],
      ["Record details", "Expose address, contact, and related operational notes where configured.", "Compare with approved source when a significant change is requested."],
      ["Search/browse", "Allows locating a company by name or context.", "Use exact names from reports and packets."],
    ],
    operatorNotes: [
      "Reference data should be verified before important packet or compliance work.",
      "Do not change bureau reference data based on memory or old documents.",
      "Record the source for any significant reference-data correction.",
    ],
    configurationScope: [
      "Reference records may feed packet addressing, bureau-specific handling, and compliance review.",
      "Changes can affect generated outputs across users.",
      "Updates should be source-backed and reviewed.",
    ],
    workflows: [
      workflow(
        "Confirm bureau contact information",
        "Use when a support ticket questions bureau address/contact data or historical delivery records.",
        [
          "Open Credit Reporting Companies.",
          "Search or browse for the bureau named in the credit report or packet.",
          "Open the record and read the contact and address fields.",
          "Compare the field to the approved reference source or current operational policy.",
          "If the record is correct, document the confirmation in the related task.",
          "If the record may be stale, do not update immediately. Capture the source and route for review.",
        ],
        undefined,
        [
          "The exact bureau/company record was identified.",
          "The confirmation source is recorded.",
        ],
      ),
      workflow(
        "Review a bureau-specific handling note",
        "Use when a report layout, historical packet record, or dispute support workflow behaves differently for a bureau.",
        [
          "Open the bureau record and read operational notes.",
          "Compare the note to the affected report or parser case.",
          "Check Parser Testing or Reporting Format Guide if the issue is data layout rather than contact data.",
          "Document whether the bureau note explains the workflow behavior.",
          "Escalate if the note is outdated or conflicts with current parser behavior.",
        ],
        undefined,
        [
          "Bureau-specific behavior is either explained or escalated.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Verify a packet address",
        "Example: A support ticket asks whether a bureau packet was sent to the correct address.",
        [
          "Open the packet record or support ticket and identify the bureau name.",
          "Open Credit Reporting Companies and find the matching record.",
          "Compare the address in the packet to the reference record.",
          "Open Activity Logs for historical packet or delivery timing if needed.",
          "If the address differs, determine whether the packet used stale data or a bureau-specific override.",
        ],
        [
          "Use the exact bureau name from the packet.",
          "Do not assume all bureaus use the same destination.",
        ],
        [
          "Packet and reference data either agree or the discrepancy is documented.",
        ],
      ),
      task(
        "Request a reference-data update",
        "Example: A verified source shows a bureau address changed.",
        [
          "Capture the current record field and proposed new value.",
          "Capture the authoritative source and date checked.",
          "Assess downstream impact on packets and templates.",
          "Submit the update through the approved change path.",
          "After update, regenerate or preview affected packet output.",
        ],
        [
          "Keep source citations with reference changes.",
          "Review generated output after changing address/contact data.",
        ],
        [
          "Updated value persists and generated output uses it where expected.",
        ],
      ),
    ],
    commonErrors: defaultErrors("credit reporting company references"),
    troubleshooting: defaultTroubleshooting("credit reporting company references"),
    bestPractices: [
      "Use exact bureau names.",
      "Verify reference changes against an approved source.",
      "Check packet output after changes.",
      "Separate contact/reference issues from parser layout issues.",
    ],
    completionChecklist: commonCompletion("credit reporting company references"),
    relatedPages: ["Reporting Format Guide", "Dispute Process Reset", "Activity Logs", "Parser Testing"],
  },
  {
    name: "Laws",
    slug: "laws",
    route: "/statutes",
    group: "Legal & Rules",
    overview: "Laws provides statutory and regulatory reference material used to support compliance findings, templates, evidence review, and admin correction decisions.",
    purpose: "Use this section to confirm legal references and jurisdiction context. It is operational reference material and must not be used to give individualized legal advice to customers.",
    screenshotFocus: "The screenshot shows statute/reference entries, jurisdiction context, and detail records.",
    mainPanels: [
      ["Law records", "List statutes, summaries, and jurisdiction fields.", "Confirm the exact authority before mapping a finding."],
      ["Details", "Show context, citations, sections, and references where configured.", "Use details to support admin correction and template review."],
      ["Related obligations", "Connect laws to creditor, bureau, collector, or enforcement concepts.", "Review the obligation page when practical duties matter."],
    ],
    operatorNotes: [
      "Use legal references as internal operating support, not customer legal advice.",
      "Jurisdiction matters. Do not map a finding to a law that does not apply to the user/report context.",
      "If citation accuracy is uncertain, mark for reference review before finalizing.",
    ],
    configurationScope: [
      "Law/reference records can influence finding explanations, regulation mapping, and training examples.",
      "Reference changes require source verification.",
      "Admin-verified citation status should be used only after human validation.",
    ],
    workflows: [
      workflow(
        "Confirm a statutory reference",
        "Use when a finding, template, or correction needs authority support.",
        [
          "Open Laws and search for the statute, jurisdiction, or reference phrase.",
          "Open the record and read jurisdiction, statute name, section, and summary.",
          "Compare the reference to the affected finding category and user/report province where applicable.",
          "Open related obligation pages if the question concerns a creditor, bureau, or collector duty.",
          "Use the reference in admin notes only if it matches the issue and jurisdiction.",
          "If unclear, mark citation for review rather than forcing a mapping.",
        ],
        undefined,
        [
          "Reference jurisdiction and issue type match the finding.",
          "The admin note avoids giving customer-specific legal advice.",
        ],
      ),
      workflow(
        "Support a finding correction decision",
        "Use when finalizing, correcting, or rejecting a machine finding.",
        [
          "Open the finding in Finding Corrections.",
          "Identify the claimed issue, evidence fields, and affected province/jurisdiction.",
          "Open Laws and find a matching statutory or regulatory reference.",
          "Verify the citation text or source details.",
          "Return to Finding Corrections and link or verify the reference only if it supports the corrected finding.",
          "If the law does not support the finding, reject or reclassify the finding rather than stretching the citation.",
        ],
        [
          "Confirm/correct: use when evidence and authority align.",
          "Reject: use when no authority supports the claim.",
          "Training note only: use when useful for future review but not actionable now.",
        ],
        [
          "Finalized finding has source evidence and matching authority where required.",
          "Unsupported findings are not finalized as confirmed violations.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Check jurisdiction-specific context",
        "Example: A finding depends on provincial limitation timing.",
        [
          "Identify the user's province from the source record or account context.",
          "Open Laws and filter/search for the province and issue type.",
          "Compare timing, scope, and applicability to the source account.",
          "Document the reference used and any uncertainty.",
          "Escalate if the record lacks province or account-type data needed for exact mapping.",
        ],
        [
          "Never borrow authority from another province because it looks similar.",
          "Missing province can block exact-field authority mapping.",
        ],
        [
          "Jurisdiction is confirmed or the finding remains review-only.",
        ],
      ),
      task(
        "Review a citation marked incorrect",
        "Example: A previous admin marked a regulation reference incorrect in Finding Corrections.",
        [
          "Open the correction and read the incorrect-reference note.",
          "Open Laws and locate the disputed reference.",
          "Check whether the issue is wrong jurisdiction, wrong section, stale text, or unsupported application.",
          "Update the correction reference status only after verifying the correct source.",
          "Escalate reference-data defects for update.",
        ],
        [
          "Keep the old incorrect marker until a correct source is identified.",
          "Do not delete citation history just to make a finding look cleaner.",
        ],
        [
          "Reference status reflects verified source review.",
        ],
      ),
    ],
    commonErrors: defaultErrors("laws references"),
    troubleshooting: defaultTroubleshooting("laws references"),
    bestPractices: [
      "Verify jurisdiction before relying on a law record.",
      "Use legal references as operational support, not legal advice.",
      "Do not finalize unsupported legal conclusions.",
      "Keep citation notes factual and source-backed.",
    ],
    completionChecklist: commonCompletion("laws references"),
    relatedPages: ["Finding Corrections", "Rules Creditors Must Follow", "Rules Credit Reporting Companies Must Follow", "Rules Collectors Must Follow", "Enforcement"],
  },
  {
    name: "Reporting Format Guide",
    slug: "reporting-format-guide",
    route: "/metro2-compliance",
    group: "Legal & Rules",
    overview: "Reporting Format Guide explains credit-reporting format expectations, field meanings, and Metro 2 style concepts used during parser, mapping, and compliance review.",
    purpose: "Use this section to interpret report fields, distinguish formatting problems from legal findings, and support parser mapping decisions.",
    screenshotFocus: "The screenshot shows guide content, field/reference groupings, and examples used for report-format interpretation.",
    mainPanels: [
      ["Format concepts", "Explain account fields, dates, balances, statuses, and reporting structures.", "Use when a parser output field needs meaning, not legal classification."],
      ["Examples", "Show malformed, inconsistent, or expected data patterns.", "Compare to source report text before creating a parser correction."],
      ["Reference entries", "Support mapping decisions and terminology.", "Use exact field names in correction notes."],
    ],
    operatorNotes: [
      "A format issue is not automatically a confirmed legal violation.",
      "Use exact field paths and source excerpts when documenting parser defects.",
      "Report-format guidance should inform parser mapping and evidence review.",
    ],
    configurationScope: [
      "This page is reference content, not a direct detector switch.",
      "Insights from this page may lead to parser mappings, rule changes, or correction notes.",
      "Do not use format concepts to overstate legal outcomes.",
    ],
    workflows: [
      workflow(
        "Interpret a report field",
        "Use when a parser field or finding references a report term that needs clarification.",
        [
          "Open Reporting Format Guide and search for the field or concept.",
          "Read the meaning, expected format, and common variants.",
          "Compare the guide to the source report text or PDF view.",
          "Open Parser Testing if the parser mapped the field incorrectly.",
          "Open Laws or obligation pages only if the question is legal duty rather than data format.",
        ],
        undefined,
        [
          "The field meaning is documented with exact source context.",
          "Parser and legal issues are separated in the admin note.",
        ],
      ),
      workflow(
        "Support parser mapping decisions",
        "Use when a report layout causes fields to land in the wrong platform property.",
        [
          "Identify the source field label, neighboring labels, and account section from the report.",
          "Open Reporting Format Guide and confirm the target field meaning.",
          "Open Parser Mappings and search for existing mappings by bureau and field name.",
          "If no mapping exists or the mapping is stale, document the expected field path and source evidence.",
          "Create a parser correction or mapping update request with exact terms and examples.",
        ],
        undefined,
        [
          "The mapping request includes source label, target field, bureau/layout, and evidence.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Distinguish missing field from not reported",
        "Example: A date appears blank in parser output.",
        [
          "Open the source report text or PDF.",
          "Use the guide to determine whether the field is normally expected for that account type.",
          "If the bureau reports the value but parser missed it, save Missing From Parser in adjudication.",
          "If the bureau did not report it, mark Not Reported By Bureau where the correction workflow supports it.",
          "If legal authority for exact-field requirements is missing, keep the issue review-only.",
        ],
        [
          "Do not convert ordinary missing data into legal violation findings without exact authority.",
          "Use source evidence to separate parser defects from source absence.",
        ],
        [
          "Correction decision matches what the bureau actually reported.",
        ],
      ),
      task(
        "Explain a malformed field",
        "Example: A payment history string appears inconsistent.",
        [
          "Locate the source string in raw text or PDF.",
          "Open Reporting Format Guide and review expected formatting.",
          "Compare length, symbols, dates, and neighboring account context.",
          "Open Risk Triage or Finding Corrections only if the malformed field generated a finding.",
          "Document the exact string and why it is malformed.",
        ],
        [
          "Keep the explanation focused on format unless legal authority is separately mapped.",
        ],
        [
          "The malformed-field note includes exact source text and target interpretation.",
        ],
      ),
    ],
    commonErrors: defaultErrors("reporting format guide"),
    troubleshooting: defaultTroubleshooting("reporting format guide"),
    bestPractices: [
      "Use exact field names and source excerpts.",
      "Separate format, parser, and legal issues.",
      "Treat blank values carefully: missing from parser and not reported by bureau are different.",
      "Back mapping decisions with deterministic fixtures where possible.",
    ],
    completionChecklist: commonCompletion("reporting format guide"),
    relatedPages: ["Parser Testing", "Parser Mappings", "Finding Corrections", "Laws", "Risk Triage"],
  },
  {
    name: "Rules Creditors Must Follow",
    slug: "creditor-rules",
    route: "/creditor-obligations",
    group: "Legal & Rules",
    overview: "Rules Creditors Must Follow summarizes creditor duties used in review, correction, dispute packet, and compliance workflows.",
    purpose: "Use this section to understand creditor responsibilities when reviewing inaccurate, incomplete, unfair, stale, or unsupported account reporting.",
    screenshotFocus: "The screenshot shows creditor obligation records, summaries, detail panels, and references.",
    mainPanels: [
      ["Obligation list", "Shows creditor duties and related issue areas.", "Find the obligation that matches the account and evidence."],
      ["Details", "Explain timing, evidence, and operational context.", "Use details to decide what evidence is required."],
      ["References", "Connect obligations to laws or internal guide content.", "Verify authority before finalizing a finding."],
    ],
    operatorNotes: [
      "Creditor obligations are separate from bureau and collector obligations.",
      "Do not combine multiple duties into one vague finding.",
      "Evidence should identify the creditor/furnisher action or omission.",
    ],
    configurationScope: [
      "Reference data can support finding mapping and packet language.",
      "Updates require verified authority and operational review.",
      "Obligation pages inform decisions but do not themselves change findings.",
    ],
    workflows: [
      workflow(
        "Confirm a creditor obligation",
        "Use when a finding or packet claim depends on what a creditor/furnisher must do.",
        [
          "Open Rules Creditors Must Follow.",
          "Search or browse for the duty that matches the issue, such as accuracy, update timing, documentation, or response quality.",
          "Read the duty, evidence requirements, and related references.",
          "Compare to the source account, creditor name, dates, and bureau records.",
          "Open Laws if the obligation requires citation support.",
          "Use the obligation only if the source record shows the creditor-specific issue.",
        ],
        undefined,
        [
          "Creditor identity and duty match the source evidence.",
          "The finding note does not assign bureau/collector duties to the creditor.",
        ],
      ),
      workflow(
        "Support a correction or packet review",
        "Use when a creditor issue may appear in a dispute packet.",
        [
          "Open the affected tradeline or finding correction.",
          "Identify the creditor/furnisher, account number mask, status, dates, and evidence excerpt.",
          "Open the relevant creditor obligation.",
          "Confirm whether the obligation supports a challenge, correction request, or training note only.",
          "If supported, ensure packet/template wording stays factual and does not overstate the conclusion.",
          "If unsupported, reject or reclassify the finding rather than forcing the creditor obligation.",
        ],
        undefined,
        [
          "Packet or correction language is backed by creditor-specific evidence.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Identify missing evidence",
        "Example: A stale-reporting finding names a creditor but the source lacks update dates.",
        [
          "Open the source account and inspect date fields, status, and raw text.",
          "Open creditor obligations for the issue type.",
          "List which evidence elements are present and which are missing.",
          "If the missing element is in source text but not parsed, open Parser Testing.",
          "If the missing element is not reported, treat the finding cautiously and document uncertainty.",
        ],
        [
          "Do not finalize when required creditor evidence is missing.",
          "Escalate parser gaps separately from unsupported findings.",
        ],
        [
          "Evidence gap is documented and routed correctly.",
        ],
      ),
      task(
        "Keep admin notes neutral",
        "Example: A creditor appears to have reported inconsistent status.",
        [
          "Describe the observed data: creditor, account, bureau, dates, status values.",
          "Reference the relevant obligation without declaring intent or misconduct.",
          "State what must be verified next.",
          "Use confirmed violation language only if evidence and authority both support it.",
        ],
        [
          "Avoid words that imply motive.",
          "Separate possible issue from confirmed finding.",
        ],
        [
          "The note is factual, source-backed, and escalation-ready.",
        ],
      ),
    ],
    commonErrors: defaultErrors("creditor obligations"),
    troubleshooting: defaultTroubleshooting("creditor obligations"),
    bestPractices: [
      "Match the duty to the correct actor.",
      "Use evidence-first review.",
      "Avoid unsupported legal conclusions.",
      "Keep notes neutral and exact.",
    ],
    completionChecklist: commonCompletion("creditor obligations"),
    relatedPages: ["Laws", "Reporting Format Guide", "Finding Corrections", "Dispute Process Reset", "Risk Triage"],
  },
  {
    name: "Rules Credit Reporting Companies Must Follow",
    slug: "bureau-rules",
    route: "/bureau-obligations",
    group: "Legal & Rules",
    overview: "Rules Credit Reporting Companies Must Follow summarizes bureau duties for reporting accuracy, investigation, correction, and dispute handling.",
    purpose: "Use this section to review bureau-specific responsibilities and determine whether evidence supports bureau-focused correction, escalation, or packet language.",
    screenshotFocus: "The screenshot shows bureau obligation entries, details, and reference context.",
    mainPanels: [
      ["Obligation list", "Shows bureau responsibilities.", "Choose the duty that matches the bureau behavior, not the creditor behavior."],
      ["Details", "Explain evidence, timing, and escalation context.", "Use when checking dispute response or correction obligations."],
      ["References", "Connect to laws and broader compliance context.", "Verify jurisdiction and source before citation mapping."],
    ],
    operatorNotes: [
      "Bureau obligations are not the same as creditor or collector obligations.",
      "Confirm which bureau reported the data and whether the issue appears across bureaus.",
      "Do not combine separate bureau duties into one finding without separate evidence.",
    ],
    configurationScope: [
      "Reference data informs finding correction and packet review.",
      "Obligation records should stay current with verified references.",
      "This page does not directly change detector behavior.",
    ],
    workflows: [
      workflow(
        "Confirm a bureau obligation",
        "Use when the issue is about credit reporting company investigation, correction, or reporting behavior.",
        [
          "Open Rules Credit Reporting Companies Must Follow.",
          "Find the obligation matching the issue type: accuracy, reinvestigation, correction, disclosure, or dispute handling.",
          "Confirm the bureau name in the source report or packet.",
          "Compare the obligation to the evidence and timeline.",
          "Open Laws for citation support if the finding will be finalized or mapped.",
          "Document bureau-specific facts separately from creditor facts.",
        ],
        undefined,
        [
          "The bureau duty and source bureau match.",
          "Evidence supports the action chosen in Finding Corrections or packet review.",
        ],
      ),
      workflow(
        "Review dispute response responsibilities",
        "Use when a dispute response appears incomplete or inconsistent.",
        [
          "Open the user's dispute/packet or evidence timeline.",
          "Identify the bureau, sent date, response date, and response content.",
          "Open bureau obligations related to investigation and correction.",
          "Compare timing and content to the obligation details.",
          "Open Enforcement if escalation options are being considered.",
          "Document exact dates and source excerpts.",
        ],
        undefined,
        [
          "Response review has exact dates and bureau identity.",
          "Any escalation path is supported by obligation and evidence context.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Separate cross-bureau inconsistency from bureau duty",
        "Example: One bureau reports a balance that another bureau does not.",
        [
          "Open the account comparison or source records.",
          "Identify each bureau and field value.",
          "Use Reporting Format Guide to confirm field meaning.",
          "Use bureau obligations to decide whether the issue is bureau reporting/investigation behavior.",
          "Use creditor obligations if the problem is furnisher data supplied across bureaus.",
        ],
        [
          "Cross-bureau difference is an evidence pattern, not automatically a bureau violation.",
          "Map each duty to the actor responsible for the behavior.",
        ],
        [
          "The finding category and obligation actor are aligned.",
        ],
      ),
      task(
        "Document bureau evidence",
        "Example: A bureau failed to update an account after a correction.",
        [
          "Record bureau name, report date, account, field, and observed value.",
          "Record correction or dispute evidence that should have changed the value.",
          "Open bureau obligations and identify the matching duty.",
          "Link or cite the source evidence in the correction workflow.",
          "Avoid broad claims about all bureaus if only one bureau is affected.",
        ],
        [
          "Be precise about bureau-specific facts.",
          "Do not merge multi-bureau issues unless each bureau has evidence.",
        ],
        [
          "Evidence links match the bureau and account under review.",
        ],
      ),
    ],
    commonErrors: defaultErrors("bureau obligations"),
    troubleshooting: defaultTroubleshooting("bureau obligations"),
    bestPractices: [
      "Confirm the bureau name in the source record.",
      "Keep bureau duties separate from creditor and collector duties.",
      "Use exact dates for investigation and correction timelines.",
      "Map citations only when authority and jurisdiction align.",
    ],
    completionChecklist: commonCompletion("bureau obligations"),
    relatedPages: ["Laws", "Credit Reporting Companies", "Finding Corrections", "Enforcement", "Reporting Format Guide"],
  },
  {
    name: "Rules Collectors Must Follow",
    slug: "collector-rules",
    route: "/collector-obligations",
    group: "Legal & Rules",
    overview: "Rules Collectors Must Follow summarizes collection-account duties used in collection reporting, payment acknowledgement, dispute handling, and escalation review.",
    purpose: "Use this section to evaluate collection-specific reporting and dispute issues without confusing collector duties with creditor or bureau obligations.",
    screenshotFocus: "The screenshot shows collector obligation entries, examples, and related details.",
    mainPanels: [
      ["Collector obligation records", "Show duties and examples tied to collection accounts.", "Use only when the source account involves a collector or collection behavior."],
      ["Details/evidence guidance", "Explain required context and examples.", "Identify what source evidence is needed before finalizing."],
      ["References", "Connect collector duties to law or enforcement concepts.", "Verify citation before mapping."],
    ],
    operatorNotes: [
      "Collection-account evidence often involves assignment dates, payment acknowledgement, dispute notices, and collector identity.",
      "Separate original creditor, collector, and bureau behavior.",
      "Use cautious language when source account ownership is unclear.",
    ],
    configurationScope: [
      "Reference records inform corrections and packet language.",
      "Changes require verified authority.",
      "This section does not directly change detector rules.",
    ],
    workflows: [
      workflow(
        "Review collector reporting duties",
        "Use when a finding concerns a collection account or collector behavior.",
        [
          "Open Rules Collectors Must Follow.",
          "Find the obligation matching the issue: reporting accuracy, payment acknowledgement, disputed debt handling, assignment, or communication.",
          "Open the source tradeline and confirm the account is actually a collection account.",
          "Identify collector name, original creditor if present, account number mask, balance, dates, and reported status.",
          "Compare the source evidence to the obligation.",
          "Open Laws or Enforcement only if citation or escalation review is needed.",
        ],
        undefined,
        [
          "The duty is collector-specific.",
          "Source account identity and collection status are clear.",
        ],
      ),
      workflow(
        "Support escalation after inadequate response",
        "Use when a collector response appears incomplete, stale, or inconsistent.",
        [
          "Open support/evidence records and identify the response date and content.",
          "Open collector obligations for the relevant duty.",
          "Compare response content to the source dispute or evidence request.",
          "Open Enforcement to understand possible escalation mechanisms.",
          "Document exact source excerpts and avoid assumptions about intent.",
          "Route for compliance review if the escalation path is uncertain.",
        ],
        undefined,
        [
          "Escalation note is source-backed and actor-specific.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Confirm evidence for a collector issue",
        "Example: A finding says a collector did not acknowledge payment.",
        [
          "Open the source account and evidence records.",
          "Confirm collector identity and payment/event dates.",
          "Check whether the source report actually shows payment acknowledgement or absence.",
          "Use collector obligations to identify the duty and evidence required.",
          "If evidence is missing from parser output but present in source text, create a parser correction.",
        ],
        [
          "Do not infer collector behavior from a creditor-only account.",
          "Keep payment/event evidence exact.",
        ],
        [
          "Collector finding has source evidence or is held for further review.",
        ],
      ),
      task(
        "Separate collector and bureau duties",
        "Example: A collection account appears on a bureau report with an incorrect balance.",
        [
          "Identify who supplied or displayed the incorrect data when possible.",
          "Open collector obligations if collector reporting behavior is at issue.",
          "Open bureau obligations if investigation/correction display behavior is at issue.",
          "Record which actor the finding applies to.",
          "Use separate findings or notes when both actors have distinct issues.",
        ],
        [
          "One source record can involve multiple actors, but each duty needs separate evidence.",
        ],
        [
          "Admin note identifies actor, duty, and evidence separately.",
        ],
      ),
    ],
    commonErrors: defaultErrors("collector obligations"),
    troubleshooting: defaultTroubleshooting("collector obligations"),
    bestPractices: [
      "Confirm the account is collection-related before using collector duties.",
      "Separate collector, creditor, and bureau actors.",
      "Use exact payment, dispute, assignment, and response dates.",
      "Avoid unsupported conclusions about intent.",
    ],
    completionChecklist: commonCompletion("collector obligations"),
    relatedPages: ["Laws", "Enforcement", "Finding Corrections", "Reporting Format Guide", "Risk Triage"],
  },
  {
    name: "Enforcement",
    slug: "enforcement",
    route: "/enforcement-mechanisms",
    group: "Legal & Rules",
    overview: "Enforcement summarizes regulatory, procedural, or operational escalation mechanisms that may apply after failed correction, investigation, or dispute workflows.",
    purpose: "Use this section to understand escalation options and internal context. Do not present enforcement paths as guaranteed outcomes.",
    screenshotFocus: "The screenshot shows enforcement mechanism records, descriptions, and references.",
    mainPanels: [
      ["Mechanism records", "Describe possible escalation paths.", "Use to understand options, not to promise outcomes."],
      ["Details", "Explain when a mechanism may apply and what evidence is usually needed.", "Confirm evidence and jurisdiction before using."],
      ["References", "Connect enforcement concepts to laws and obligations.", "Verify citation and scope before escalation."],
    ],
    operatorNotes: [
      "Enforcement notes are often internal unless approved for customer-safe communication.",
      "Escalation depends on evidence, jurisdiction, timing, and prior workflow history.",
      "Use cautious language and avoid guaranteeing regulatory action.",
    ],
    configurationScope: [
      "Reference content informs escalation and support decisions.",
      "Updates require source verification and compliance review.",
      "This page does not file complaints or trigger enforcement by itself.",
    ],
    workflows: [
      workflow(
        "Review escalation options",
        "Use when a correction, dispute, or response workflow fails to resolve an issue.",
        [
          "Open Enforcement and identify the mechanism that appears related to the issue.",
          "Open Laws and the relevant obligation page to confirm authority and actor duty.",
          "Open source records to confirm dates, evidence, and prior attempts.",
          "Evaluate whether the mechanism is internal, customer-facing, regulatory, or procedural.",
          "Document prerequisites that are present and missing.",
          "Escalate for compliance review before using customer-facing enforcement language.",
        ],
        undefined,
        [
          "Escalation path is matched to evidence and jurisdiction.",
          "Any missing prerequisites are documented.",
        ],
      ),
      workflow(
        "Support internal triage",
        "Use when deciding whether an issue stays in support, moves to admin correction, or needs compliance escalation.",
        [
          "Identify the actor: creditor, bureau, collector, platform, or user.",
          "Open the matching obligation page and law record.",
          "Open Enforcement for possible next steps.",
          "Compare required prerequisites with the source timeline.",
          "Choose the next internal state: continue evidence gathering, correct source data, reject unsupported finding, or escalate.",
          "Document the decision and why.",
        ],
        undefined,
        [
          "The next state is clear and source-backed.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Prepare an escalation summary",
        "Example: A bureau response did not address a verified correction request.",
        [
          "List the source facts: bureau, account, dates, prior request, response, and current incorrect value.",
          "Identify the obligation and law reference that may apply.",
          "Identify the enforcement mechanism that may be relevant.",
          "Write a neutral internal summary with evidence and missing prerequisites.",
          "Route for approval before any customer-facing or external language is used.",
        ],
        [
          "Keep enforcement language internal until approved.",
          "Avoid statements that imply guaranteed regulatory consequences.",
        ],
        [
          "Summary has facts, references, evidence, and approval status.",
        ],
      ),
      task(
        "Reject an unsupported escalation",
        "Example: A finding has no matching authority or missing source evidence.",
        [
          "Open the source finding and evidence.",
          "Check the relevant obligation and law records.",
          "Confirm which prerequisite is missing.",
          "Document why escalation is unsupported.",
          "Route back to evidence gathering, parser correction, or finding rejection.",
        ],
        [
          "Unsupported escalation should not be forced through as a confirmed violation.",
        ],
        [
          "The record shows why escalation was not used.",
        ],
      ),
    ],
    commonErrors: defaultErrors("enforcement references"),
    troubleshooting: defaultTroubleshooting("enforcement references"),
    bestPractices: [
      "Verify jurisdiction and prerequisites.",
      "Keep enforcement notes cautious and internal unless approved.",
      "Use evidence and timeline before escalation labels.",
      "Separate operational escalation from legal advice.",
    ],
    completionChecklist: commonCompletion("enforcement references"),
    relatedPages: ["Laws", "Rules Creditors Must Follow", "Rules Credit Reporting Companies Must Follow", "Rules Collectors Must Follow", "Support Tickets"],
  },
  {
    name: "Regulatory Updates",
    slug: "regulatory-updates",
    route: "/regulatory-updates",
    group: "Legal & Rules",
    overview: "Regulatory Updates tracks changes that may affect platform rules, references, templates, training, and admin workflows.",
    purpose: "Use this section to review, classify, and coordinate approved regulatory knowledge updates before changing detectors, templates, references, or operating procedures.",
    screenshotFocus: "The screenshot shows regulatory update records, status, impact, and review context.",
    mainPanels: [
      ["Update list", "Shows pending and historical updates.", "Prioritize updates that affect active rules, packet language, or legal references."],
      ["Details", "Explain source, jurisdiction, effective date, and affected areas.", "Read details before changing any rule or reference data."],
      ["Actions/status", "Support review and follow-up state.", "Use status to make work visible to other admins."],
    ],
    operatorNotes: [
      "Do not change rules based on unverified updates.",
      "Regulatory changes often require coordinated updates across laws, obligations, templates, rule settings, parser tests, and training examples.",
      "A pending update should remain pending until source and impact are reviewed.",
    ],
    configurationScope: [
      "Updates may lead to reference data, detector, template, or workflow changes.",
      "Status changes affect operational tracking.",
      "Implementation requires downstream verification.",
    ],
    workflows: [
      workflow(
        "Review a new regulatory update",
        "Use when an update appears in the queue or is added by operations.",
        [
          "Open Regulatory Updates and select the pending update.",
          "Read source, jurisdiction, effective date, summary, and affected workflow areas.",
          "Confirm the source is approved and current.",
          "Identify impacted pages: Laws, obligations, Rule Check Settings, Dispute Process Reset, Finding Corrections, Parser Testing, or Admin Guide.",
          "Document required follow-up tasks and owners.",
          "Do not mark complete until the downstream changes and checks are done.",
        ],
        undefined,
        [
          "Update has source verification and impact assessment.",
          "Follow-up tasks identify affected platform areas.",
        ],
      ),
      workflow(
        "Coordinate downstream changes",
        "Use after an update is verified and approved.",
        [
          "Update reference content first so citations and obligations are correct.",
          "Review detector thresholds or categories only if the update changes detection behavior.",
          "Review templates if customer-facing language changes.",
          "Add or update parser/regression fixtures if source data interpretation changes.",
          "Run targeted tests and source-page previews.",
          "Record the completed changes and residual risks.",
        ],
        [
          "Reference-only update: update Laws/obligation pages and documentation.",
          "Detector update: change Rule Check Settings and run regression checks.",
          "Dispute wording update: add the requirement to the dispute process redesign plan.",
        ],
        [
          "All affected pages were reviewed.",
          "Testing or preview evidence is attached to the update note.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Identify affected rule categories",
        "Example: A new timing interpretation affects stale reporting review.",
        [
          "Read the regulatory update summary and source.",
          "Map the issue to existing finding categories.",
          "Open Rule Check Settings to see whether a threshold or enabled state is involved.",
          "Open Risk Triage to sample current affected findings.",
          "Open Finding Corrections to inspect whether existing training examples need review.",
        ],
        [
          "Do not infer category impact without checking current detector categories.",
          "Document when no existing category is affected.",
        ],
        [
          "Impacted categories are listed with required action or no-action reason.",
        ],
      ),
      task(
        "Retest affected workflows",
        "Example: An update changes wording used in a dispute template.",
        [
          "Apply approved reference/template changes.",
          "Generate a representative output or preview.",
          "Run targeted parser or finding-correction tests if detection behavior changed.",
          "Open Activity Logs to confirm sensitive changes.",
          "Update the regulatory update status only after verification.",
        ],
        [
          "Preview customer-facing outputs after wording changes.",
          "Run regression when detection or parser behavior changes.",
        ],
        [
          "Affected workflow has test or preview evidence.",
        ],
      ),
    ],
    commonErrors: defaultErrors("regulatory updates"),
    troubleshooting: defaultTroubleshooting("regulatory updates"),
    bestPractices: [
      "Verify source and jurisdiction before action.",
      "Map impact across rules, references, templates, parser, and training.",
      "Retest affected workflows.",
      "Keep status aligned with real completion, not just review start.",
    ],
    completionChecklist: commonCompletion("regulatory updates"),
    relatedPages: ["Laws", "Rule Check Settings", "Dispute Process Reset", "Finding Corrections", "Parser Testing", "Admin Guide"],
  },
  {
    name: "Lifecycle Testing",
    slug: "lifecycle-testing",
    route: "/admin-mock-lifecycle",
    group: "Tools",
    overview: "Lifecycle Testing runs controlled mock-user workflows for end-to-end validation of registration, upload, parsing, account creation, dispute reset coverage, support, and cleanup behavior.",
    purpose: "Use this section to validate the platform lifecycle without using a real customer account or production data.",
    screenshotFocus: "The screenshot shows lifecycle test controls, run status, workflow stages, and cleanup/result panels.",
    mainPanels: [
      ["Run controls", "Create and execute mock lifecycle tests.", "Use disposable mock accounts only."],
      ["Stage output", "Shows each lifecycle stage and result.", "Use failed stage context to decide whether to open Error Logs or source pages."],
      ["Cleanup controls", "Remove mock data when approved.", "Confirm target is a mock user before cleanup."],
      ["Result summary", "Shows completion, coverage, and residual data state.", "Use as validation evidence after checks."],
    ],
    operatorNotes: [
      "Do not run lifecycle cleanup against real users.",
      "Use the local or staging admin UI flow for operations review rather than server-local file paths.",
      "Failed lifecycle stages should be traced through source pages and logs before rerunning repeatedly.",
    ],
    configurationScope: [
      "Lifecycle tests create, mutate, and clean up mock data.",
      "They validate workflows but should not be used with production customer records.",
      "Cleanup behavior can remove mock reports, tradelines, packets, sessions, and related rows.",
    ],
    workflows: [
      workflow(
        "Run a mock user lifecycle",
        "Use before releases or after changes to auth, upload, parser, packet, support, or cleanup behavior.",
        [
          "Open Lifecycle Testing from the Tools group.",
          "Confirm the environment and that the configured account/email is disposable mock data.",
          "Start the lifecycle run and monitor each stage.",
          "When a stage fails, stop and read the failure details before rerunning.",
          "Open Error Logs for server/API failures and Activity Logs for successfully completed mutations.",
          "After a successful run, review generated artifacts, account records, and packet status if the test covers them.",
          "Run cleanup only after confirming the test data is no longer needed.",
        ],
        [
          "Run: use for end-to-end validation.",
          "Inspect failure: use before rerun when any stage fails.",
          "Cleanup: use after validation with mock user confirmation.",
        ],
        [
          "Every required stage passed or has a documented expected failure.",
          "Cleanup removed mock data without affecting real users.",
        ],
      ),
      workflow(
        "Validate upload-to-packet flow",
        "Use when parser, historical packet, delivery, or dispute reset changes may affect the main customer lifecycle.",
        [
          "Start a lifecycle run with a representative mock report.",
          "Confirm upload completes and parser output is created.",
          "Inspect tradeline and finding creation stages.",
          "Confirm packet generation remains blocked and historical packet support still reads user profile, bureau/creditor references, and evidence where applicable.",
          "Open related source pages for any failed or ambiguous stage.",
          "Record run ID, mock user email, report artifact ID, and packet ID for release notes.",
        ],
        undefined,
        [
          "Upload, parser, tradeline, finding, packet, and cleanup stages are verified.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Investigate a failed lifecycle stage",
        "Example: Historical packet support or dispute reset coverage fails after parser output succeeds.",
        [
          "Read the failed stage name and message.",
          "Open Error Logs around the failure time and search by route or endpoint.",
          "Open Activity Logs to identify which earlier stages succeeded.",
          "Open the source page for the failed artifact, account, or packet.",
          "Decide whether the failure is test data, parser output, template, permissions, or application defect.",
          "Escalate with run ID, stage, source IDs, and screenshot.",
        ],
        [
          "Do not rerun blindly if the failure created partial data.",
          "Preserve source IDs before cleanup.",
        ],
        [
          "Failure cause is categorized and escalation is reproducible.",
        ],
      ),
      task(
        "Clean up mock lifecycle data",
        "Example: A successful test run has served its validation purpose.",
        [
          "Confirm the account is a mock/disposable test user.",
          "Record run ID and key artifacts before cleanup if needed for release evidence.",
          "Run cleanup from the lifecycle tool.",
          "Review cleanup summary for remaining records.",
          "Open User Management or logs if residual records remain unexpectedly.",
        ],
        [
          "Never use cleanup for real customer repair.",
          "Use User Management reset workflow for approved real-user repair cases.",
        ],
        [
          "Mock data is removed or residuals are documented.",
        ],
      ),
    ],
    commonErrors: defaultErrors("lifecycle testing"),
    troubleshooting: defaultTroubleshooting("lifecycle testing"),
    bestPractices: [
      "Use disposable mock accounts only.",
      "Record run IDs and artifact IDs.",
      "Investigate failed stages before reruns.",
      "Confirm cleanup target before deleting mock data.",
    ],
    completionChecklist: commonCompletion("lifecycle testing"),
    relatedPages: ["User Management", "Parser Testing", "Error Logs", "Activity Logs", "Support Tickets"],
  },
  {
    name: "Parser Testing",
    slug: "parser-testing",
    route: "/admin-parser-testing",
    group: "Tools",
    overview: "Parser Testing validates credit report extraction, Stage Lab runs, saved test cases, deterministic replay, parser output, import/export, run-all regression behavior, and finding correction handoff.",
    purpose: "Use this section to prove that report ingestion and extraction are reliable before relying on findings, packets, training examples, or downstream user-facing output.",
    screenshotFocus: "The screenshot shows Parser Testing tabs, saved cases, Stage Lab, run controls, and parser output review areas.",
    mainPanels: [
      ["Test Cases", "Durable regression cases with PDFs, expected values, saved output, approved truth, and adjudication decisions.", "Use for parser baselines and single-case validation."],
      ["Stage Lab", "Runs a shadow parse without immediately changing baselines.", "Use for exploratory parsing and source-quality inspection."],
      ["Finding Corrections", "Reviews machine findings, admin corrections, evidence, regulation mappings, and training labels.", "Use when parser output affects compliance findings."],
      ["Run All Tests", "Runs every active test case through deterministic parser checks.", "Use as parser release gate."],
      ["Import/Export", "Moves parser test case bundles between environments or stores backups.", "Export before bulk edits or deletion."],
    ],
    operatorNotes: [
      "Treat the parser as untrusted until a human verifies source output against the original bureau report.",
      "AI, LLM, DocStrange, and OCR-assisted outputs are diagnostic only unless deterministic rules validate and adopt behavior later.",
      "A passing parser test means current parser output matches expected or approved truth. It does not automatically prove the baseline is correct.",
    ],
    configurationScope: [
      "Saved test cases, approved values, adjudication decisions, parser rule candidates, and imported bundles affect regression truth.",
      "Run All results are release-gate evidence.",
      "Exports can include PDFs and report data and must be protected.",
    ],
    workflows: [
      workflow(
        "Turn a new PDF into a regression test",
        "Use when a report layout, parser defect, or new bureau variation should become durable test coverage.",
        [
          "Open Parser Testing and select Stage Lab.",
          "Upload the authorized test PDF and run a shadow parse.",
          "Review quality gates, source coverage, review queue, raw text, parsed consumer fields, parsed tradelines, canonical hash, and replay validation when available.",
          "If the output is useful, save the Stage Lab run to Test Cases.",
          "Open the new Test Case and review Saved Parser Output.",
          "Accept saved output only if it matches the source report. Otherwise, use Admin Adjudication to correct fields one at a time.",
          "Run the single test case and resolve Failed or Needs Review states.",
          "Run All Tests before considering the parser change release-ready.",
          "Export updated test cases after meaningful review work.",
        ],
        [
          "Accept Saved Output: use only after full source comparison.",
          "Corrected: use when parser value exists but is wrong.",
          "Missing From Parser: use when bureau reports a value the parser missed.",
          "Not Reported By Bureau: use when the source truly lacks the field.",
          "Ignore: use for a field that should not drive baseline truth.",
        ],
        [
          "Single test passes or has documented expected failure.",
          "Run All has no unexpected failures.",
          "Exported backup exists after major baseline work.",
        ],
      ),
      workflow(
        "Run parser regression safely",
        "Use before and after parser, mapping, extraction, date handling, or rule-candidate changes.",
        [
          "Open Run All Tests.",
          "Confirm no other admin is editing baselines mid-run.",
          "Click Run All Tests and wait for completion.",
          "Review total, passed, failed, and needs-review counts.",
          "Open each failure with View and compare expected/approved truth to actual output.",
          "Classify each failure as parser defect, stale baseline, fixture/source issue, or expected known failure.",
          "Fix or document every unexpected failure before release signoff.",
        ],
        undefined,
        [
          "Every failed case has a classification.",
          "Unexpected parser defects have issue notes and source IDs.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Investigate Blank / not parsed",
        "Example: The selected date field shows blank even though the PDF appears to contain it.",
        [
          "Confirm the selected Entity, Account/Section, and Field to Review are correct.",
          "Check Raw Extracted Text for the value.",
          "If the value appears in raw text, save Missing From Parser or Corrected with exact source evidence.",
          "If the value is absent from raw text, treat it as extraction/OCR/source issue rather than mapping-only.",
          "Add parser instruction explaining the expected deterministic behavior.",
          "Promote a parser rule only if the correction matches a supported rule template and validation passes.",
        ],
        [
          "Do not overwrite non-null extracted values with null unless the source truly does not report the value.",
          "Preserve raw text and replay context for developer review.",
        ],
        [
          "Correction decision is saved with source evidence.",
          "Future parser run either reproduces approved truth or has a documented defect.",
        ],
      ),
      task(
        "Import or export test cases",
        "Example: Move a focused regression bundle from staging to local for developer reproduction.",
        [
          "Select exact test cases or Select All for a full backup.",
          "Export selected cases and store the JSON in approved internal storage.",
          "When importing, choose only trusted parser test exports.",
          "Preview the count before import.",
          "Import creates new rows and does not deduplicate existing cases.",
          "Run All Tests after import.",
        ],
        [
          "Export before deletion or bulk editing.",
          "Protect exported JSON because it can contain PDF base64 and report data.",
        ],
        [
          "Imported cases are executable.",
          "Duplicate rows are reviewed intentionally.",
        ],
      ),
    ],
    commonErrors: defaultErrors("parser testing"),
    troubleshooting: defaultTroubleshooting("parser testing"),
    bestPractices: [
      "Use deterministic fixtures for parser changes.",
      "Verify baselines against original reports before trusting pass/fail results.",
      "Export test cases after major adjudication work.",
      "Preserve replay hash, source hash, and raw text when escalating parser defects.",
    ],
    completionChecklist: commonCompletion("parser testing"),
    relatedPages: ["Finding Corrections", "Parser Mappings", "Reporting Format Guide", "Risk Triage", "Error Logs"],
  },
  {
    name: "Finding Corrections",
    slug: "finding-corrections",
    route: "/admin-parser-testing?tab=violation-corrections",
    group: "Tools",
    overview: "Finding Corrections is the admin truth layer for reviewing, correcting, rejecting, adding, finalizing, and training compliance findings derived from parser extraction runs.",
    purpose: "Use this section when a machine finding needs human review, evidence linking, regulation mapping, authority verification, training label assignment, or source-backed finalization.",
    screenshotFocus: "The screenshot shows the Finding Corrections tab with run selection, tradeline/finding context, correction controls, evidence, references, and finalization surfaces.",
    mainPanels: [
      ["Run list", "Shows extraction runs and finding counts.", "Select the source run that matches the Risk Triage or parser test case."],
      ["Tradeline list", "Shows accounts in the selected run.", "Choose the exact account before editing a finding."],
      ["Original Extraction", "Displays machine-generated finding details.", "Use as input to review, not as final truth."],
      ["Admin Correction", "Stores action, corrected type, severity, summary, explanation, notes, and training label.", "Save before linking evidence or references."],
      ["Evidence", "Links source quotes, pages, fields, normalized values, and reasons.", "Finalized actionable findings need source evidence unless marked training note only."],
      ["Regulation Mapping", "Links, verifies, marks incorrect, or removes authority references.", "Use verified citations only after admin validation."],
    ],
    operatorNotes: [
      "Use the product term compliance finding unless authority and review support confirmed legal violation language.",
      "Finalize only when action, evidence, and regulation requirements are satisfied.",
      "Training note only is for useful review data that should not become an actionable customer-facing finding.",
    ],
    configurationScope: [
      "Corrections can influence the deterministic admin truth layer used by future finding retrieval.",
      "Finalized positive corrections can support future canonical findings and training examples.",
      "Rejected corrections can suppress false positives for exact source scope.",
    ],
    workflows: [
      workflow(
        "Review and correct a machine finding",
        "Use when Risk Triage or Parser Testing identifies a finding that needs human adjudication.",
        [
          "Open Finding Corrections with the run, tradeline, and finding selected when possible.",
          "Confirm extraction run ID, tradeline ID, creditor, bureau, and account mask.",
          "Read the original machine finding category, severity, summary, explanation, confidence, and technical details.",
          "Compare the finding to source report evidence and parser output.",
          "Choose the correction action: Confirm, Correct, Reject, Missed Issue, or Training Note Only.",
          "If correcting, enter corrected type, severity, confidence, summary, explanation, correction reason, and admin notes.",
          "Save the correction before linking evidence or regulation references.",
          "Add evidence with source excerpt, page/field context, normalized value, and reason.",
          "Add or verify regulation references only when authority supports the finding.",
          "Finalize when requirements are complete. Refresh and confirm finalized state persists.",
        ],
        [
          "Confirm: machine finding is accurate and supported.",
          "Correct: finding exists but category, severity, explanation, evidence, or mapping is wrong.",
          "Reject: machine finding is false positive or unsupported.",
          "Missed Issue: source supports a finding the machine missed.",
          "Training Note Only: useful for future learning but not actionable now.",
        ],
        [
          "Saved correction persists after refresh.",
          "Evidence and references are linked where required.",
          "Finalized state is visible and searchable.",
        ],
      ),
      workflow(
        "Add a missed issue",
        "Use when source evidence supports a compliance finding that the machine did not create.",
        [
          "Select the extraction run and tradeline.",
          "Click or choose the missed-issue path.",
          "Enter the corrected finding type, severity, confidence, summary, and explanation.",
          "Set training label to false negative where appropriate.",
          "Save the correction.",
          "Add source evidence proving the issue exists.",
          "Add regulation reference if the issue will be actionable.",
          "Finalize only after evidence and reference checks are complete.",
        ],
        undefined,
        [
          "The missed issue is tied to exact source scope.",
          "It does not duplicate an existing active finding category for the same account unless justified.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Reject a false positive finding",
        "Example: The detector flagged stale reporting, but source dates show the account was updated correctly.",
        [
          "Select the run, tradeline, and original finding.",
          "Set correction action to Rejected.",
          "Set training label to False Positive if the record should train future behavior.",
          "Enter a correction reason explaining why the source evidence does not support the finding.",
          "Add evidence or mark Training Note Only depending on the workflow requirements.",
          "Save and finalize when complete.",
          "Return to Risk Triage and verify the active queue reflects the decision if applicable.",
        ],
        [
          "Reject for evidence reasons, not convenience.",
          "Keep the explanation factual and specific.",
        ],
        [
          "Rejected correction persists and the active queue state matches expected behavior.",
        ],
      ),
      task(
        "Verify or mark regulation references incorrect",
        "Example: A mapped reference appears to cite the wrong section.",
        [
          "Open the linked reference and read jurisdiction, body, regulation, section, and text.",
          "Compare to Laws and obligation pages.",
          "If correct, mark/admin-verify the citation only after source validation.",
          "If wrong, mark incorrect and add a note explaining why.",
          "Add a correct replacement reference if available.",
          "Do not finalize an actionable confirmed/corrected finding with only an incorrect reference.",
        ],
        [
          "Incorrect is a meaningful review state; do not delete history just to hide a bad mapping.",
          "Use verified only for source-checked citations.",
        ],
        [
          "Reference status accurately reflects admin review.",
          "Finalized actionable findings have active supported references.",
        ],
      ),
    ],
    commonErrors: defaultErrors("finding corrections"),
    troubleshooting: defaultTroubleshooting("finding corrections"),
    bestPractices: [
      "Save the correction before linking evidence or references.",
      "Use exact source excerpts and field names.",
      "Do not finalize unsupported findings.",
      "Keep training labels aligned with the correction action.",
      "Use confirmed legal violation language only when evidence and authority support it.",
    ],
    completionChecklist: commonCompletion("finding corrections"),
    relatedPages: ["Risk Triage", "Parser Testing", "Laws", "Reporting Format Guide", "Rules Creditors Must Follow", "Rules Credit Reporting Companies Must Follow"],
  },
  {
    name: "Parser Mappings",
    slug: "parser-mappings",
    route: "/admin-parser-mappings",
    group: "Tools",
    overview: "Parser Mappings controls how report text fields are interpreted and assigned to platform fields. It supports deterministic extraction and field normalization.",
    purpose: "Use this section to find, review, and maintain mapping rules when bureau layouts or source labels change.",
    screenshotFocus: "The screenshot shows mapping tables, filters, field context, and mapping-management surfaces.",
    mainPanels: [
      ["Mapping list", "Displays known parser field mappings.", "Search before adding or changing mappings."],
      ["Filters/search", "Narrow mappings by bureau, field, status, or text.", "Use exact bureau and source label when available."],
      ["Mapping details/history", "Show field normalization and previous changes where available.", "Review history before altering a broad mapping."],
      ["Test/suggestion panels", "Help validate mapping behavior.", "Use fixture evidence before activation."],
    ],
    operatorNotes: [
      "Broad mapping changes can silently alter many parser outputs.",
      "Conflicting mappings should be escalated before saving.",
      "Fixture coverage is required for meaningful mapping changes.",
    ],
    configurationScope: [
      "Mappings influence deterministic parser output.",
      "Mapping changes can affect findings, packets, and regression cases.",
      "Updates should be paired with parser tests.",
    ],
    workflows: [
      workflow(
        "Find and review a mapping",
        "Use before changing parser behavior for a field.",
        [
          "Open Parser Mappings.",
          "Search by exact source label, normalized field path, bureau, or report concept.",
          "Open mapping details and review source pattern, target field, bureau scope, and status.",
          "Check history/diff behavior if visible.",
          "Open Parser Testing to find a fixture that exercises the mapping.",
          "Document whether the mapping is current, stale, conflicting, or missing.",
        ],
        undefined,
        [
          "Mapping status is understood before edits.",
          "Relevant fixture or source report is identified.",
        ],
      ),
      workflow(
        "Correct a stale mapping",
        "Use when a bureau layout or source label changed and parser output is now wrong.",
        [
          "Collect source evidence from the PDF/raw text and the incorrect parser output.",
          "Find the existing mapping by old label or target field.",
          "Determine whether the mapping needs a narrower scope, new alias, or deactivation.",
          "Make the smallest mapping change that addresses the observed source.",
          "Run the affected parser test case.",
          "Run broader regression checks if the mapping is shared across many fields or bureaus.",
          "Document the before/after behavior and source evidence.",
        ],
        [
          "Narrow alias: use when one bureau/layout variant changed.",
          "Broad mapping update: use only with fixture coverage across affected layouts.",
          "Escalate conflict: use when two source labels map to the same target with different meanings.",
        ],
        [
          "Affected test case passes.",
          "No broad regression failures are introduced.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Validate a mapping after report format change",
        "Example: Equifax changes a balance label that parser no longer recognizes.",
        [
          "Use Stage Lab to parse the new sample report.",
          "Identify the missing or wrong field in canonical output.",
          "Open Reporting Format Guide to confirm target meaning.",
          "Open Parser Mappings and search for the old and new labels.",
          "Create or update mapping scope based on evidence.",
          "Save and rerun the sample as a parser test.",
        ],
        [
          "Use bureau-specific scope when a label is not universal.",
          "Do not guess target fields from label text alone.",
        ],
        [
          "The new sample parses correctly and existing fixtures still pass.",
        ],
      ),
      task(
        "Resolve conflicting mappings",
        "Example: Two source labels look similar but one means credit limit and one means high credit.",
        [
          "Collect source examples for both labels.",
          "Compare field meanings in Reporting Format Guide.",
          "Review current mapping history.",
          "Narrow mapping scope by bureau/layout/account type if possible.",
          "Create a parser correction or developer task if UI controls cannot express the needed distinction.",
        ],
        [
          "Conflicts should be resolved with examples, not preference.",
          "Avoid broad fallback rules when source labels are ambiguous.",
        ],
        [
          "Each source example maps to the correct target without breaking the other.",
        ],
      ),
    ],
    commonErrors: defaultErrors("parser mappings"),
    troubleshooting: defaultTroubleshooting("parser mappings"),
    bestPractices: [
      "Search before changing mappings.",
      "Use exact source labels and target field paths.",
      "Prefer narrow scoped changes with fixtures.",
      "Run parser regression after meaningful mapping changes.",
    ],
    completionChecklist: commonCompletion("parser mappings"),
    relatedPages: ["Parser Testing", "Reporting Format Guide", "Finding Corrections", "Error Logs"],
  },
  {
    name: "AI Assist",
    slug: "ai-assist",
    route: "/admin-ai-assist",
    group: "Tools",
    overview: "AI Assist helps admins draft internal summaries, investigate support or compliance context, and organize review questions.",
    purpose: "Use AI Assist as a drafting and thinking aid. It must not replace source evidence, admin judgment, legal review, parser correction, or authority mapping.",
    screenshotFocus: "The screenshot shows the AI Assist prompt and response workspace used for internal admin help.",
    mainPanels: [
      ["Prompt area", "Accepts admin questions and context.", "Ask focused questions and avoid unnecessary sensitive data."],
      ["Response area", "Returns assistance for the prompt/context.", "Verify facts in source records before acting."],
      ["Context links/params", "May be opened from Risk Triage with finding context.", "Confirm the linked record before using the output."],
    ],
    operatorNotes: [
      "AI output can be wrong or incomplete.",
      "Do not paste secrets, tokens, reset links, private keys, or unrelated customer records.",
      "Use source pages and logs as the authority for factual statements.",
    ],
    configurationScope: [
      "AI Assist does not directly change records unless the UI later provides explicit actions.",
      "Prompts and responses may contain sensitive internal test data and should be treated as internal.",
      "Customer-facing text drafted with AI must be reviewed and edited.",
    ],
    workflows: [
      workflow(
        "Summarize a support issue",
        "Use to turn verified source facts into an internal working summary.",
        [
          "Open the relevant ticket, user, risk, or parser record first.",
          "Collect only the necessary facts: route, user role, finding category, source status, and verified dates.",
          "Open AI Assist and ask for an internal summary with review questions.",
          "Compare every factual claim in the response against source pages.",
          "Remove unsupported claims, legal advice, and internal implementation details before using in a ticket note.",
          "Use the summary as a draft, not as final evidence.",
        ],
        undefined,
        [
          "Final note contains verified facts only.",
          "Source record references are retained separately from AI prose.",
        ],
      ),
      workflow(
        "Draft next review steps",
        "Use when a complex risk item needs a checklist before action.",
        [
          "Open AI Assist with the finding or issue context.",
          "Ask for review steps grouped by source evidence, parser truth, regulation mapping, and customer-safe communication.",
          "Remove any step that is not supported by actual platform pages.",
          "Execute the checklist manually in Risk Triage, Parser Testing, Laws, or Support Tickets.",
          "Document actual outcomes from source pages, not the suggested plan alone.",
        ],
        undefined,
        [
          "Checklist steps map to real pages and records.",
          "Completed outcomes are source-backed.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Preview a risk finding explanation",
        "Example: Risk Triage opens AI Preview for a high-risk stale-reporting finding.",
        [
          "Open the AI Preview from the exact finding row.",
          "Ask for a neutral internal explanation and evidence questions.",
          "Open the Account and Fix Source pages to verify each point.",
          "Discard or correct any unsupported statement.",
          "Use the verified version for internal notes or support drafting only.",
        ],
        [
          "AI Preview is not a false-positive decision.",
          "Do not rely on AI for citation verification.",
        ],
        [
          "The final explanation is verified against source records.",
        ],
      ),
      task(
        "Draft customer-safe language",
        "Example: A support reply needs a concise explanation of what was reviewed.",
        [
          "Provide AI Assist only with verified facts and the desired tone.",
          "Ask for plain-language wording without legal advice or guarantees.",
          "Remove internal IDs, stack traces, route names, and unsupported conclusions.",
          "Compare the draft to the ticket and source records before sending.",
        ],
        [
          "Never send AI output unreviewed.",
          "Keep legal and compliance conclusions cautious.",
        ],
        [
          "Reply is factual, customer-safe, and source-backed.",
        ],
      ),
    ],
    commonErrors: defaultErrors("AI assist"),
    troubleshooting: defaultTroubleshooting("AI assist"),
    bestPractices: [
      "Ask focused questions.",
      "Minimize sensitive context.",
      "Verify every factual statement.",
      "Use AI for drafts and checklists, not final decisions.",
    ],
    completionChecklist: commonCompletion("AI assist"),
    relatedPages: ["Risk Triage", "Support Tickets", "Finding Corrections", "Activity Logs", "Error Logs"],
  },
  {
    name: "Version Management",
    slug: "version-management",
    route: "/admin-version-management",
    group: "Tools",
    overview: "Version Management tracks release records, migration metadata, and feature flags. It helps admins understand release state and staged feature availability.",
    purpose: "Use this section to review release information, mark migration metadata after verification, and enable or disable feature flags under approved change control.",
    screenshotFocus: "The screenshot shows version, migration, and feature-flag management tabs.",
    mainPanels: [
      ["Versions", "Lists release/version records and notes.", "Use for release context and operational history."],
      ["Migrations", "Shows migration metadata and mark-applied/rolled-back controls.", "These buttons mark metadata; they do not execute SQL."],
      ["Feature Flags", "Controls staged feature availability.", "Change flags only with approval and rollback plan."],
    ],
    operatorNotes: [
      "Migration buttons are metadata controls. They do not run database migrations.",
      "Feature flags can expose or hide user/admin functionality.",
      "Release notes should reflect actual deployed behavior and known risks.",
    ],
    configurationScope: [
      "Version records are operational metadata.",
      "Migration status metadata affects admin visibility into deployment state.",
      "Feature flags can change application behavior for selected audiences.",
    ],
    workflows: [
      workflow(
        "Review current release version",
        "Use before support diagnosis, deployment signoff, or staging validation.",
        [
          "Open Version Management and select Versions.",
          "Identify current version, date, notes, and status.",
          "Compare release notes to the workflow under review.",
          "Open Activity Logs if the release metadata was recently changed.",
          "Document version context in support or validation notes.",
        ],
        undefined,
        [
          "Version context is known before diagnosing release-sensitive behavior.",
        ],
      ),
      workflow(
        "Mark migration metadata",
        "Use only after an actual migration has already been verified by the deployment process.",
        [
          "Open Migrations and find the migration record.",
          "Confirm the migration was applied or rolled back outside this UI.",
          "Read the current metadata status.",
          "Click Mark Applied or Mark Rolled Back according to verified state.",
          "Refresh and confirm metadata state persists.",
          "Record verification source and timestamp.",
        ],
        [
          "Mark Applied: use after confirmed successful migration.",
          "Mark Rolled Back: use after confirmed rollback.",
          "Do not use: when you are trying to execute SQL or repair schema.",
        ],
        [
          "Metadata matches verified migration state.",
          "Activity Logs show the metadata change.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Toggle a feature flag",
        "Example: Enable a staged admin tool for approved testing.",
        [
          "Open Feature Flags.",
          "Find the exact flag by name and description.",
          "Confirm audience, environment, approval, and rollback plan.",
          "Change the flag state and save.",
          "Refresh and verify state persists.",
          "Open the affected route or workflow and confirm behavior matches expectation.",
          "Record the flag state change in the release/admin note.",
        ],
        [
          "Use flags for approved staged access, not ad hoc experiments on users.",
          "Know how to disable the flag before enabling it.",
        ],
        [
          "Flag state persists and affected behavior matches expected access.",
        ],
      ),
      task(
        "Create or update release notes",
        "Example: A staging repair changed admin sidebar discoverability.",
        [
          "Open Versions and select the current or target release record.",
          "Add concise notes describing changed admin behavior, checks run, and residual risks.",
          "Avoid secrets, credentials, or private deployment details.",
          "Save and refresh.",
          "Confirm notes are visible to admins who need release context.",
        ],
        [
          "Release notes should summarize operational impact, not implementation noise.",
        ],
        [
          "Notes persist and accurately describe the release.",
        ],
      ),
    ],
    commonErrors: defaultErrors("version management"),
    troubleshooting: defaultTroubleshooting("version management"),
    bestPractices: [
      "Do not confuse migration metadata with migration execution.",
      "Change feature flags only with approval.",
      "Keep rollback paths clear.",
      "Record release context for support-sensitive changes.",
    ],
    completionChecklist: commonCompletion("version management"),
    relatedPages: ["Activity Logs", "Error Logs", "Rule Check Settings", "Admin Guide", "Lifecycle Testing"],
  },
  {
    name: "Platform Functions PDF",
    slug: "platform-functions-pdf",
    route: "Sidebar footer download",
    group: "Tools",
    overview: "Platform Functions PDF is the sidebar footer export that generates a downloadable reference guide for platform functions and operating context.",
    purpose: "Use this export when admins need an offline internal reference for platform capabilities, training, or workflow review.",
    screenshotFocus: "The screenshot shows the sidebar footer Platform Functions button used to generate the PDF.",
    mainPanels: [
      ["Sidebar footer button", "Downloads the Platform Functions PDF.", "Use after confirming the current app build and documentation are up to date."],
      ["Generated PDF", "Contains internal reference content.", "Open and inspect the generated file before sharing internally."],
      ["Toast/error handling", "Shows download failure or success context.", "Check Error Logs if generation fails."],
    ],
    operatorNotes: [
      "Use current PDFs only. Regenerate after documentation, navigation, or workflow changes.",
      "Do not distribute internal PDFs outside approved channels.",
      "The PDF may contain internal operational descriptions and should be handled as internal training material.",
    ],
    configurationScope: [
      "The export does not change application data.",
      "The generated file can become stale after feature or workflow changes.",
      "Failures usually indicate PDF generation, network, or endpoint problems.",
    ],
    workflows: [
      workflow(
        "Generate an offline function reference",
        "Use when onboarding admins or validating documentation after a release.",
        [
          "Open the admin app and confirm you are signed in as admin.",
          "Scroll or look to the sidebar footer.",
          "Click Platform Functions.",
          "Wait for the PDF download process to complete.",
          "Open the generated PDF and confirm title, date/context, and expected sections.",
          "Store the PDF only in approved internal training storage.",
        ],
        undefined,
        [
          "PDF opens without corruption.",
          "Content reflects current platform functions.",
        ],
      ),
      workflow(
        "Diagnose a PDF download failure",
        "Use when the sidebar button shows an error or no file downloads.",
        [
          "Click the button once and wait for the loading spinner to finish.",
          "Read the error toast if present.",
          "Open Error Logs and search by PDF/export/platform-functions context.",
          "Check Activity Logs if the export action is audited.",
          "Retry once after refresh if the error appears transient.",
          "Escalate repeated failures with route, timestamp, screenshot, and error summary.",
        ],
        [
          "Transient failure: refresh and retry once.",
          "Repeated failure: escalate with logs.",
          "Content issue: regenerate after source documentation is corrected.",
        ],
        [
          "A working PDF is generated or the failure is escalated with evidence.",
        ],
      ),
    ],
    commonTasks: [
      task(
        "Attach to approved internal training",
        "Example: A new admin onboarding checklist references the Platform Functions PDF.",
        [
          "Generate the PDF from the current app.",
          "Open it and verify it matches current navigation and feature names.",
          "Store it in approved internal training material.",
          "Record the generation date and app version if available.",
          "Replace older copies when a new version is generated.",
        ],
        [
          "Do not use stale exports for training.",
          "Do not place internal PDFs in public or customer-facing storage.",
        ],
        [
          "Training material references the current PDF.",
        ],
      ),
      task(
        "Verify after documentation changes",
        "Example: Admin manuals were rebuilt and the export should still work.",
        [
          "Run the documentation generation step.",
          "Open the app and click Platform Functions.",
          "Open the downloaded PDF.",
          "Check for missing sections, broken formatting, or stale labels.",
          "If the export depends on source helper content, update the source and regenerate.",
        ],
        [
          "PDF generation should be part of documentation release checks.",
        ],
        [
          "The generated PDF opens and content is current.",
        ],
      ),
    ],
    commonErrors: defaultErrors("platform functions PDF"),
    troubleshooting: defaultTroubleshooting("platform functions PDF"),
    bestPractices: [
      "Regenerate after major workflow changes.",
      "Inspect the downloaded PDF before use.",
      "Keep exports internal.",
      "Escalate repeated generation failures with logs and screenshots.",
    ],
    completionChecklist: commonCompletion("platform functions PDF"),
    relatedPages: ["Admin Guide", "Error Logs", "Activity Logs", "Version Management"],
  },
];

function section(title: string, body: Content[]): Content[] {
  return [{ text: title, style: "sectionHeader" }, ...body];
}

function subsection(title: string, body: Content[]): Content[] {
  return [{ text: title, style: "subsectionHeader" }, ...body];
}

function paragraph(text: string): Content {
  return { text, style: "body" };
}

function note(text: string): Content {
  return { text, style: "note", margin: [0, 0, 0, 8] };
}

function bullets(items: string[]): Content {
  return { ul: items, style: "list" };
}

function numbers(items: string[]): Content {
  return { ol: items, style: "list" };
}

function smallBullets(items: string[]): Content {
  return { ul: items, style: "smallList" };
}

function detailTable(rows: DetailRow[], headers: DetailRow = ["Area", "What it means", "Admin procedure"]): Content {
  return {
    table: {
      headerRows: 1,
      widths: ["25%", "36%", "39%"],
      body: [
        headers.map((header) => ({ text: header, style: "tableHeader" })),
        ...rows.map((row) => row.map((cell) => ({ text: cell, style: "tableCell" }))),
      ],
    },
    layout: {
      fillColor: (rowIndex: number) => (rowIndex === 0 ? "#12355b" : rowIndex % 2 === 0 ? "#f4f7fb" : null),
      hLineColor: () => "#d7e0ea",
      vLineColor: () => "#d7e0ea",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 10],
  };
}

function screenshotBlock(manual: Manual): Content[] {
  const screenshotPath = join(screenshotDir, `${manual.slug}.png`);
  if (!existsSync(screenshotPath)) {
    return [
      note(
        `Screenshot missing: ${screenshotPath}. Regenerate screenshots from the dev admin environment before publishing this manual.`,
      ),
    ];
  }

  const imageBase64 = readFileSync(screenshotPath).toString("base64");
  return [
    {
      image: `data:image/png;base64,${imageBase64}`,
      fit: [500, 330],
      alignment: "center",
      margin: [0, 0, 0, 6],
    },
    { text: manual.screenshotFocus, style: "caption" },
  ];
}

function workflowContent(item: Workflow): Content[] {
  return [
    ...subsection(item.title, [
      paragraph(item.summary),
      { text: "Procedure", style: "minorHeader" },
      numbers(item.steps),
      ...(item.options && item.options.length > 0
        ? [{ text: "Decision options", style: "minorHeader" }, bullets(item.options)]
        : []),
      { text: "Verification", style: "minorHeader" },
      bullets(item.verification),
    ]),
  ];
}

function taskContent(item: CommonTask): Content[] {
  return [
    ...subsection(item.title, [
      note(item.example),
      { text: "Drilldown procedure", style: "minorHeader" },
      numbers(item.procedure),
      { text: "Best practices for this task", style: "minorHeader" },
      bullets(item.bestPractices),
      { text: "Done when", style: "minorHeader" },
      bullets(item.verification),
    ]),
  ];
}

function contentFor(manual: Manual, index: number): Content[] {
  return [
    { text: manual.name, style: "title" },
    { text: "Admin Operations and Configuration Manual", style: "subtitle" },
    { text: `Manual ${String(index + 1).padStart(2, "0")} of ${manuals.length}`, style: "meta" },
    { text: `Route: ${manual.route}`, style: "meta" },
    { text: `Group: ${manual.group}`, style: "meta" },
    { text: `Generated: ${generatedDate}`, style: "meta", margin: [0, 0, 0, 16] },
    ...section("1. Section Overview", [paragraph(manual.overview), paragraph(manual.purpose)]),
    ...section("2. Current Admin Screenshot", [
      note("Screenshot source: localhost development admin environment with test data. Test data is permitted for these manuals and should still be treated as internal."),
      ...screenshotBlock(manual),
    ]),
    ...section("3. Access and Operating Rules", [bullets(accessRequirements), bullets(manual.operatorNotes)]),
    ...section("4. Screen Anatomy and Controls", [detailTable(manual.mainPanels)]),
    ...section("5. Step-by-Step Instructions", manual.workflows.flatMap(workflowContent)),
    ...section("6. Common Tasks With Drilldown Examples", manual.commonTasks.flatMap(taskContent)),
    ...section("7. Configuration and Change-Control Scope", [bullets(manual.configurationScope)]),
    ...section("8. Common Errors", [detailTable(manual.commonErrors, ["Problem", "Likely cause", "Admin response"])]),
    ...section("9. Troubleshooting", [detailTable(manual.troubleshooting, ["Check", "Why it matters", "How to proceed"])]),
    ...section("10. Best Practices", [bullets(manual.bestPractices)]),
    ...section("11. Completion Checklist", [smallBullets(manual.completionChecklist)]),
    ...section("12. Related Admin Areas", [bullets(manual.relatedPages)]),
  ];
}

function docFor(manual: Manual, index: number): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: [46, 58, 46, 54],
    content: contentFor(manual, index),
    defaultStyle: { font: "Roboto", fontSize: 9.5, lineHeight: 1.2, color: "#243042" },
    styles,
    header: () => ({
      text: "Credit Regulator Pro - Admin Operations Manual",
      style: "footer",
      alignment: "right",
      margin: [46, 24, 46, 0],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "Internal test-environment operations guide", style: "footer" },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", style: "footer" },
      ],
      margin: [46, 0, 46, 24],
    }),
  };
}

function combinedDoc(): TDocumentDefinitions {
  const content: Content[] = [
    { text: "Credit Regulator Pro", style: "title" },
    { text: "Complete Admin Operations and Configuration Manual Set", style: "subtitle" },
    { text: `Generated: ${generatedDate}`, style: "meta", margin: [0, 0, 0, 16] },
    paragraph(
      "This combined guide contains every admin manual in the current set. It is intended for internal operations, configuration, training, and test-environment review.",
    ),
    ...section("Manual Index", [
      {
        ol: manuals.map((manual) => `${manual.name} - ${manual.route}`),
        style: "list",
      },
    ]),
  ];

  manuals.forEach((manual, index) => {
    content.push({ text: "", pageBreak: "before" });
    content.push(...contentFor(manual, index));
  });

  return {
    pageSize: "LETTER",
    pageMargins: [46, 58, 46, 54],
    content,
    defaultStyle: { font: "Roboto", fontSize: 9.5, lineHeight: 1.2, color: "#243042" },
    styles,
    header: () => ({
      text: "Credit Regulator Pro - Combined Admin Manual Set",
      style: "footer",
      alignment: "right",
      margin: [46, 24, 46, 0],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "Internal test-environment operations guide", style: "footer" },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", style: "footer" },
      ],
      margin: [46, 0, 46, 24],
    }),
  };
}

const styles: StyleDictionary = {
  title: { fontSize: 25, bold: true, color: "#12355b", margin: [0, 0, 0, 4] },
  subtitle: { fontSize: 13, color: "#4b647a", margin: [0, 0, 0, 8] },
  meta: { fontSize: 8.5, color: "#5d6f7f" },
  sectionHeader: { fontSize: 14, bold: true, color: "#12355b", margin: [0, 14, 0, 6] },
  subsectionHeader: { fontSize: 11.5, bold: true, color: "#1f4e79", margin: [0, 8, 0, 4] },
  minorHeader: { fontSize: 9.5, bold: true, color: "#334155", margin: [0, 5, 0, 3] },
  body: { fontSize: 9.5, margin: [0, 0, 0, 6] },
  note: { fontSize: 8.8, italics: true, color: "#4b5563" },
  caption: { fontSize: 8.2, color: "#4b5563", alignment: "center", margin: [0, 0, 0, 8] },
  list: { fontSize: 9.2, margin: [12, 0, 0, 8] },
  smallList: { fontSize: 8.8, margin: [12, 0, 0, 8] },
  tableHeader: { fontSize: 8.2, bold: true, color: "#ffffff" },
  tableCell: { fontSize: 8.1, color: "#243042" },
  footer: { fontSize: 8, color: "#6b7280" },
};

mkdirSync(outputDir, { recursive: true });

for (const [index, manual] of manuals.entries()) {
  const pdfBase64 = await generateServerPdf(docFor(manual, index));
  const filename = `${String(index + 1).padStart(2, "0")}-${manual.slug}.pdf`;
  writeFileSync(join(outputDir, filename), Buffer.from(pdfBase64, "base64"));
  console.log(filename);
}

const combinedPdfBase64 = await generateServerPdf(combinedDoc());
writeFileSync(join(outputDir, "Combined.pdf"), Buffer.from(combinedPdfBase64, "base64"));
console.log("Combined.pdf");
console.log(`Generated ${manuals.length} admin manuals and Combined.pdf in ${outputDir}`);
