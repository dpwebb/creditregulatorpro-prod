import type { Selectable } from "kysely";
import type { LetterTemplate, LetterTemplateCategory } from "./schema";

export type DefaultLetterTemplate = {
  category: LetterTemplateCategory;
  templateKey: string;
  label: string;
  subject: string | null;
  introduction: string | null;
  statutoryGrounds: string | null;
  requestedAction: string | null;
  statutoryTimeframe: string | null;
  consumerStatementRight: string | null;
  certification: string | null;
  closing: string | null;
  fullBodyOverride: string | null;
  statutoryReference: string | null;
  sourceUrl: string | null;
};

export const LETTER_TEMPLATE_DEFAULT_FIELDS = [
  "subject",
  "introduction",
  "statutoryGrounds",
  "requestedAction",
  "statutoryTimeframe",
  "consumerStatementRight",
  "certification",
  "closing",
  "fullBodyOverride",
  "statutoryReference",
  "sourceUrl",
] as const satisfies ReadonlyArray<keyof DefaultLetterTemplate>;

const STANDARD_CERTIFICATION =
  "I certify that this dispute is submitted in good faith and that the information provided is accurate to the best of my knowledge.";

const STANDARD_CLOSING = "Sincerely,";

const PIPEDA_ACCURACY_TEXT =
  "Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used.";

const PIPEDA_SUFFICIENT_ACCURACY_TEXT =
  "Information shall be sufficiently accurate, complete, and up-to-date to minimize the possibility that inappropriate information may be used to make a decision about the individual.";

const PIPEDA_CONSENT_TEXT =
  "The knowledge and consent of the individual are required for the collection, use, or disclosure of personal information, except where inappropriate.";

const PIPEDA_RETENTION_TEXT =
  "Personal information shall be retained only as long as necessary for the fulfilment of those purposes.";

const PIPEDA_ACCESS_TEXT =
  "Upon request, an individual shall be informed of the existence, use, and disclosure of his or her personal information and shall be given access to that information.";

const PIPEDA_CHALLENGE_TEXT =
  "An individual shall be able to address a challenge concerning compliance with the above principles.";

const PIPEDA_SAFEGUARDS_TEXT =
  "Personal information shall be protected by security safeguards appropriate to the sensitivity of the information.";

const BIA_DISCHARGE_TEXT =
  "An order of discharge releases the bankrupt from all claims provable in bankruptcy.";

const STANDARD_DISPUTE_STATUTORY_GROUNDS =
  `Statutory grounds relied on for this dispute:

1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: the disputed credit-reporting data must be accurate, complete, current, and supported by the records used to make decisions about the consumer.

2. PIPEDA, Schedule 1, Principle 4.6.1. Relevant statutory text or authority excerpt: "${PIPEDA_SUFFICIENT_ACCURACY_TEXT}" Application to this account: incomplete or unsupported account fields may lead to inappropriate credit decisions and require documented review.

3. Applicable provincial consumer reporting authority. Relevant statutory text or authority excerpt: consumer reporting information must be based on reasonable procedures, source evidence, and the best evidence reasonably available. Application to this account: the bureau should identify the source records, verify each disputed field, and correct any inaccurate or unsupported reporting.`;

const STANDARD_REQUESTED_ACTION =
  `Requested correction by disputed field:
1. Open a formal reinvestigation for each disputed field identified in this letter.
2. Identify the furnisher, creditor, collector, court, insolvency record, or other source relied on for each field.
3. Compare the source records against the consumer disclosure and supporting evidence.
4. Correct any inaccurate, incomplete, stale, internally inconsistent, or unsupported field.
5. Delete or suppress any account field, inquiry, notation, or tradeline that cannot be verified from source documentation.
6. Mark the account or item as disputed while the reinvestigation is pending, where your bureau process supports dispute notation.
7. Provide written findings, an updated credit disclosure, the method of verification, and the documents or source descriptions relied on for any item that remains.`;

const BUREAU_TEMPLATES: DefaultLetterTemplate[] = [
  {
    category: "bureau",
    templateKey: "equifax",
    label: "Equifax",
    subject: "Formal Dispute and Reinvestigation Request - Equifax - {{creditorName}} {{accountNumber}}",
    introduction:
      "This is a formal dispute and reinvestigation request to Equifax. The letter is intended to identify me, identify the exact account and disputed fields, state the factual basis, reference supporting evidence, request correction or deletion of unverifiable data, and preserve a written audit trail.",
    statutoryGrounds: STANDARD_DISPUTE_STATUTORY_GROUNDS,
    requestedAction: STANDARD_REQUESTED_ACTION,
    statutoryTimeframe:
      "Please complete the reinvestigation within the applicable statutory response period and provide the results in writing, including an updated disclosure or correction notice and the verification method used for any item that remains.",
    consumerStatementRight:
      "If the disputed information remains, please advise how I may add or preserve a consumer statement explaining the dispute.",
    certification: STANDARD_CERTIFICATION,
    closing: STANDARD_CLOSING,
    fullBodyOverride: null,
    statutoryReference: "Applicable consumer reporting and privacy legislation",
    sourceUrl: null,
  },
  {
    category: "bureau",
    templateKey: "transunion",
    label: "TransUnion",
    subject: "Formal Dispute and Reinvestigation Request - TransUnion - {{creditorName}} {{accountNumber}}",
    introduction:
      "This is a formal dispute and reinvestigation request to TransUnion. The letter is intended to identify me, identify the exact account and disputed fields, state the factual basis, reference supporting evidence, request correction or deletion of unverifiable data, and preserve a written audit trail.",
    statutoryGrounds: STANDARD_DISPUTE_STATUTORY_GROUNDS,
    requestedAction: STANDARD_REQUESTED_ACTION,
    statutoryTimeframe:
      "Please complete the reinvestigation within the applicable statutory response period and provide the results in writing, including an updated disclosure or correction notice and the verification method used for any item that remains.",
    consumerStatementRight:
      "If the item remains after investigation, please provide the available consumer statement process and any file notation options.",
    certification: STANDARD_CERTIFICATION,
    closing: STANDARD_CLOSING,
    fullBodyOverride: null,
    statutoryReference: "Applicable consumer reporting and privacy legislation",
    sourceUrl: null,
  },
  {
    category: "bureau",
    templateKey: "generic",
    label: "Generic Bureau",
    subject: "Formal Dispute and Reinvestigation Request - {{bureauName}} - {{creditorName}} {{accountNumber}}",
    introduction:
      "This is a formal dispute and reinvestigation request regarding the account information identified below. The letter is intended to identify me, identify the exact account and disputed fields, state the factual basis, reference supporting evidence, request correction or deletion of unverifiable data, and preserve a written audit trail.",
    statutoryGrounds: STANDARD_DISPUTE_STATUTORY_GROUNDS,
    requestedAction: STANDARD_REQUESTED_ACTION,
    statutoryTimeframe:
      "Please complete the reinvestigation within the applicable statutory response period and provide the results in writing, including an updated disclosure or correction notice and the verification method used for any item that remains.",
    consumerStatementRight:
      "If the item is not corrected or deleted, please provide the consumer statement or explanatory note process available for this file.",
    certification: STANDARD_CERTIFICATION,
    closing: STANDARD_CLOSING,
    fullBodyOverride: null,
    statutoryReference: "Applicable consumer reporting and privacy legislation",
    sourceUrl: null,
  },
];

const PROVINCIAL_TEMPLATES = [
  ["ontario_cra", "Ontario Consumer Reporting Act", "Ontario"],
  ["nova_scotia_cra", "Nova Scotia Consumer Reporting Act", "Nova Scotia"],
  ["bc_cra", "British Columbia consumer reporting framework", "British Columbia"],
  ["new_brunswick_cra", "New Brunswick Consumer Reporting Act", "New Brunswick"],
  ["pei_cra", "Prince Edward Island Consumer Reporting Act", "Prince Edward Island"],
  ["manitoba_cpa", "Manitoba consumer protection framework", "Manitoba"],
  ["yukon_cpa", "Yukon consumer protection framework", "Yukon"],
  ["nwt_cpa", "Northwest Territories consumer protection framework", "Northwest Territories"],
  ["nunavut_cpa", "Nunavut consumer protection framework", "Nunavut"],
  ["saskatchewan_cpbpa", "Saskatchewan consumer protection and business practices framework", "Saskatchewan"],
  ["nl_cpbpa", "Newfoundland and Labrador consumer protection and business practices framework", "Newfoundland and Labrador"],
  ["quebec_a82", "Quebec private-sector privacy and credit assessment framework", "Quebec"],
  ["alberta_pipa", "Alberta Personal Information Protection Act", "Alberta"],
] as const;

const VIOLATION_FOCUS: Record<string, string> = {
  statute_of_limitations:
    "the account age, limitation-period context, or reporting chronology may not support the way the item is being reported or collected",
  bankruptcy_discharge_violation:
    "the account may not reflect the consumer's bankruptcy, discharge, proposal, or insolvency-related status accurately",
  identity_theft_violation:
    "the account may involve identity-theft indicators, blocked information, or missing identity-theft handling steps",
  documentation_chain_failure:
    "the reporting party may not have provided enough source documentation to verify the account, assignment, balance, or ownership trail",
  balance_calculation_violation:
    "the balance, past-due amount, fees, interest, or charge-off figures may not reconcile to the evidence",
  bureau_investigation_failure:
    "the bureau investigation may be incomplete, unsupported, or not tied to the specific dispute evidence submitted",
  bureau_notification_failure:
    "required notices, dispute results, or correction communications may not have been provided or preserved",
  bureau_dispute_marking_failure:
    "the account may not have been marked as disputed while an active dispute or investigation was pending",
  bureau_reinsertion_violation:
    "previously removed information may have been reinserted without the required verification and notice trail",
  bureau_access_violation:
    "the report or account information may have been accessed, used, or disclosed without a valid permissible purpose",
  furnisher_reaging_violation:
    "the furnisher may have changed dates or reporting markers in a way that makes the delinquency appear newer than the evidence supports",
  temporal_manipulation:
    "reported dates may conflict with the account chronology, last activity, delinquency, assignment, closure, or reporting history",
  account_status_inconsistency:
    "the account status may be inconsistent across fields, bureaus, reporting periods, or source documentation",
  furnisher_status_code_mismatch:
    "the status code or payment rating may not match the narrative, balance, account state, or evidence",
  collector_license_failure:
    "the collector may not have adequate licensing or authority for the jurisdiction and activity at issue",
  collector_unauthorized_fees:
    "fees, charges, interest, or collection costs may not be supported by contract, statute, judgment, or account records",
  collector_duplicate_reporting:
    "the same debt may be reported more than once, by multiple collectors, or in a way that overstates the obligation",
  collector_payment_acknowledgment_violation:
    "payments, settlements, credits, or acknowledgments may not be reflected correctly in the reported account data",
  response_mov_missing:
    "the bureau or furnisher response may omit the method of verification or the source basis for keeping the disputed item",
  response_incomplete:
    "the response may not address each disputed field, evidence item, or requested correction",
  response_no_documentation:
    "the response may confirm reporting without producing documents or records sufficient to verify the disputed information",
  response_address_mismatch:
    "the account address, identity data, or response address may not align with the consumer identity evidence",
  response_unauthorized:
    "the response may rely on an entity, source, or authorization that does not match the account record or consumer consent evidence",
  disclosure_deficiency:
    "the consumer disclosure may omit required data, source information, rights notices, or other required explanatory content",
  cross_entity_discrepancy:
    "the same account may be reported differently by bureaus, furnishers, collectors, or source documents",
  multiple_collector_violation:
    "multiple collectors may be reporting, collecting, or validating the same obligation without a clear ownership or assignment trail",
  phantom_debt_unverifiable:
    "the account may not be traceable to a valid creditor, source contract, assignment record, or consumer obligation",
  zombie_debt_resurrection:
    "old or previously resolved debt may have been revived, reassigned, or reported without current verification",
  stale_reporting_failure:
    "obsolete, outdated, or time-barred information may still be present despite age or correction requirements",
  credit_limit_manipulation:
    "credit limit or high-credit reporting may distort utilization, account history, or the consumer's file presentation",
  closed_account_balance_inflation:
    "a closed account may show a balance, past-due amount, or status that is inconsistent with closure or transfer records",
  last_activity_date_manipulation:
    "the last activity or reported activity date may be inconsistent with the actual account activity chronology",
  consumer_statement_suppression:
    "a consumer statement, dispute notation, or explanatory comment may have been omitted, removed, or not processed",
  retroactive_history_manipulation:
    "historical payment, status, or date fields may have been changed retroactively without adequate support",
  payment_history_manipulation:
    "payment history may not match the account evidence, monthly reporting record, or documented payment behavior",
  investigation_rubber_stamp:
    "the investigation may appear automated, conclusory, or unsupported by field-level review of the submitted dispute",
  furnisher_joint_account_violation:
    "joint-account, co-signer, responsibility, or authorization data may not match the consumer's legal relationship to the account",
  furnisher_authorized_user_misrepresentation:
    "authorized-user reporting may overstate responsibility or fail to distinguish the consumer from the primary obligor",
  furnisher_post_dispute_retaliation:
    "post-dispute reporting may have worsened, reappeared, or changed without adequate evidence-based justification",
  collector_statute_revival_attempt:
    "collector activity may imply revival, renewal, or enforceability that is not supported by the account chronology or law",
};

const RETENTION_OR_TIME_KEYS = new Set([
  "statute_of_limitations",
  "statute_approaching",
  "stale_reporting_failure",
  "furnisher_reaging_violation",
  "temporal_manipulation",
  "last_activity_date_manipulation",
  "collector_statute_revival_attempt",
  "zombie_debt_resurrection",
]);

const ACCESS_OR_IDENTITY_KEYS = new Set([
  "identity_theft_violation",
  "bureau_access_violation",
  "freeze_period_violation",
  "mixed_file_personal_info_mismatch",
  "response_unauthorized",
]);

const RESPONSE_OR_INVESTIGATION_KEYS = new Set([
  "bureau_investigation_failure",
  "bureau_notification_failure",
  "bureau_dispute_marking_failure",
  "response_mov_missing",
  "response_incomplete",
  "response_no_documentation",
  "response_address_mismatch",
  "investigation_rubber_stamp",
  "furnisher_response_quality",
  "creditor_response_quality",
  "consumer_statement_suppression",
]);

const COLLECTION_KEYS = new Set([
  "collector_license_failure",
  "collector_unauthorized_fees",
  "collector_duplicate_reporting",
  "collector_payment_acknowledgment_violation",
  "collection_limitation_exceeded",
  "multiple_collector_violation",
  "phantom_debt_unverifiable",
]);

function buildViolationStatutoryGrounds(key: string): string {
  const provincialReference =
    "Applicable provincial consumer reporting authority. Relevant statutory text or authority excerpt: consumer reporting information must be based on reasonable procedures, source evidence, and the best evidence reasonably available. Application to this account: the bureau should verify the disputed field or account condition against the underlying source records and correct any inaccurate, incomplete, or unsupported reporting.";

  if (key === "bankruptcy_discharge_violation") {
    return `Statutory grounds relied on for this finding:

1. Bankruptcy and Insolvency Act, s.178(2). Relevant statutory text or authority excerpt: "${BIA_DISCHARGE_TEXT}" Application to this account: post-discharge reporting must accurately reflect the legal status of any provable claim.

2. ${provincialReference}`;
  }

  if (ACCESS_OR_IDENTITY_KEYS.has(key)) {
    return `Statutory grounds relied on for this finding:

1. PIPEDA, Schedule 1, Principle 4.3. Relevant statutory text or authority excerpt: "${PIPEDA_CONSENT_TEXT}" Application to this account: access, disclosure, account ownership, or identity-theft handling must be supported by consent, authorization, or a lawful exception.

2. PIPEDA, Schedule 1, Principle 4.7. Relevant statutory text or authority excerpt: "${PIPEDA_SAFEGUARDS_TEXT}" Application to this account: sensitive consumer-reporting information must be protected against inappropriate access or misuse.

3. ${provincialReference}`;
  }

  if (RETENTION_OR_TIME_KEYS.has(key)) {
    return `Statutory grounds relied on for this finding:

1. PIPEDA, Schedule 1, Principle 4.5. Relevant statutory text or authority excerpt: "${PIPEDA_RETENTION_TEXT}" Application to this account: obsolete or time-sensitive reporting must be supported by a valid retention and reporting-period basis.

2. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: date-dependent reporting must be accurate, complete, and current for the purpose for which it is used.

3. ${provincialReference}`;
  }

  if (RESPONSE_OR_INVESTIGATION_KEYS.has(key)) {
    return `Statutory grounds relied on for this finding:

1. PIPEDA, Schedule 1, Principle 4.10. Relevant statutory text or authority excerpt: "${PIPEDA_CHALLENGE_TEXT}" Application to this account: the dispute response should address the consumer's specific challenge and show the basis for maintaining, correcting, or updating the reporting.

2. PIPEDA, Schedule 1, Principle 4.9. Relevant statutory text or authority excerpt: "${PIPEDA_ACCESS_TEXT}" Application to this account: the consumer should receive enough information to understand the existence, use, source basis, and handling of the disputed personal information.

3. ${provincialReference}`;
  }

  if (COLLECTION_KEYS.has(key)) {
    return `Statutory grounds relied on for this finding:

1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: collection-account reporting must accurately reflect the creditor, balance, assignment, payment, fee, and ownership evidence used to make decisions about the consumer.

2. ${provincialReference}`;
  }

  if (key === "consent_withdrawal_not_honored") {
    return `Statutory grounds relied on for this finding:

1. PIPEDA, Schedule 1, Principle 4.3.8. Relevant statutory text or authority excerpt: "An individual may withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice, and the organization must inform the individual of the implications." Application to this account: continued reporting after withdrawal must be reviewed against the consent record and any lawful basis for continued processing.

2. ${provincialReference}`;
  }

  return `Statutory grounds relied on for this finding:

1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: the disputed reporting must be accurate, complete, and current for the purpose for which the information is used.

2. PIPEDA, Schedule 1, Principle 4.6.1. Relevant statutory text or authority excerpt: "${PIPEDA_SUFFICIENT_ACCURACY_TEXT}" Application to this account: incomplete or unsupported account data may lead to an inappropriate decision about the consumer.

3. ${provincialReference}`;
}

function titleFromKey(key: string): string {
  const acronyms = new Map([
    ["bc", "BC"],
    ["cra", "CRA"],
    ["cpa", "CPA"],
    ["cpbpa", "CPBPA"],
    ["nl", "NL"],
    ["nwt", "NWT"],
    ["pei", "PEI"],
    ["pipa", "PIPA"],
    ["a82", "A82"],
  ]);

  return key
    .split("_")
    .map((word) => acronyms.get(word) ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildProvincialTemplate([
  key,
  statuteLabel,
  provinceLabel,
]: (typeof PROVINCIAL_TEMPLATES)[number]): DefaultLetterTemplate {
  return {
    category: "provincial",
    templateKey: key,
    label: titleFromKey(key),
    subject: `Formal Dispute and Reinvestigation Request - ${provinceLabel} - {{creditorName}} {{accountNumber}}`,
    introduction:
      `This is a formal dispute and reinvestigation request under the ${statuteLabel}. The letter is intended to identify me, identify the exact account and disputed fields, state the factual basis, reference supporting evidence, request correction or deletion of unverifiable data, and preserve a written audit trail.`,
    statutoryGrounds:
      `Statutory grounds relied on for this dispute:

1. ${statuteLabel}. Relevant statutory text or authority excerpt: credit information must be based on the best evidence reasonably available and disputed reporting must be reviewed against source records. Application to this account: the disputed account fields should be verified against the underlying furnisher, creditor, assignment, payment, and reporting records.

2. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: credit-reporting data used to make decisions about the consumer must be accurate, complete, and up-to-date for that purpose.`,
    requestedAction:
      STANDARD_REQUESTED_ACTION,
    statutoryTimeframe:
      `Please complete the reinvestigation within the response period that applies under the ${statuteLabel} or the applicable provincial dispute process, and provide the results in writing with any updated disclosure or correction notice.`,
    consumerStatementRight:
      "If the information remains after investigation, please provide the available statement, notation, or explanatory-rights process.",
    certification: STANDARD_CERTIFICATION,
    closing: STANDARD_CLOSING,
    fullBodyOverride: null,
    statutoryReference: statuteLabel,
    sourceUrl: null,
  };
}

function buildViolationTemplate(key: string): DefaultLetterTemplate {
  const label = titleFromKey(key);
  const focus = VIOLATION_FOCUS[key] ?? "the account may contain a compliance-significant reporting issue";

  return {
    category: "violation_narrative",
    templateKey: key,
    label,
    subject: `Formal Dispute and Reinvestigation Request - ${label}`,
    introduction:
      `This is a formal dispute and reinvestigation request because ${focus}. The account and exact disputed fields are identified below, and I am asking the bureau to compare the disputed data against source records, supporting evidence, and the consumer disclosure before the information continues to be reported.`,
    statutoryGrounds: buildViolationStatutoryGrounds(key),
    requestedAction:
      "Please open a reinvestigation for this account. Please verify each exact disputed field against the furnisher, creditor, collection, payment, assignment, court, insolvency, and bureau source records as applicable; correct each inaccurate, incomplete, stale, internally inconsistent, or unsupported field; delete or suppress any field or tradeline that cannot be verified from source documentation; mark the account disputed while the review is pending where supported by bureau process; update my consumer disclosure; and send written findings explaining the result, the verification method, and the source records relied on for any item that remains.",
    statutoryTimeframe: null,
    consumerStatementRight: null,
    certification: null,
    closing: null,
    fullBodyOverride: null,
    statutoryReference: "Applicable PIPEDA and provincial consumer reporting authority",
    sourceUrl: null,
  };
}

export function getDefaultLetterTemplates(): DefaultLetterTemplate[] {
  return [
    ...BUREAU_TEMPLATES,
    ...PROVINCIAL_TEMPLATES.map(buildProvincialTemplate),
    ...Object.keys(VIOLATION_FOCUS).map(buildViolationTemplate),
  ].sort((left, right) =>
    `${left.category}:${left.templateKey}`.localeCompare(`${right.category}:${right.templateKey}`)
  );
}

function isBlankText(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function hasLetterTemplateContent(template: Partial<Selectable<LetterTemplate>>): boolean {
  return LETTER_TEMPLATE_DEFAULT_FIELDS.some((field) => !isBlankText(template[field]));
}

export function buildDefaultLetterTemplatePatch(
  existing: Selectable<LetterTemplate>,
  defaults: DefaultLetterTemplate,
  options: { overwriteExisting?: boolean } = {}
): Partial<DefaultLetterTemplate> {
  const patch: Partial<DefaultLetterTemplate> = {};
  const existingHasContent = hasLetterTemplateContent(existing);

  if ((options.overwriteExisting || !existingHasContent) && existing.label !== defaults.label) {
    patch.label = defaults.label;
  }

  for (const field of LETTER_TEMPLATE_DEFAULT_FIELDS) {
    const defaultValue = defaults[field];
    if (
      defaultValue !== null &&
      (options.overwriteExisting || isBlankText(existing[field])) &&
      existing[field] !== defaultValue
    ) {
      patch[field] = defaultValue;
    }
  }

  return patch;
}
