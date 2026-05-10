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

const BUREAU_TEMPLATES: DefaultLetterTemplate[] = [
  {
    category: "bureau",
    templateKey: "equifax",
    label: "Equifax",
    subject: "Equifax dispute and reinvestigation request - {{creditorName}} {{accountNumber}}",
    introduction:
      "I am disputing the Equifax reporting of the account identified below. Based on my review, the reported information appears inaccurate, incomplete, or unsupported by the file evidence. Please complete a documented reinvestigation and provide the results in writing.",
    statutoryGrounds:
      "This dispute is made under applicable consumer reporting legislation, privacy obligations, and accuracy/integrity duties requiring consumer reporting information to be accurate, complete, and verifiable.",
    requestedAction:
      "Please verify the source records for the disputed account, correct or delete any item that cannot be verified, update all affected fields across the file, and provide a written explanation of the investigation outcome.",
    statutoryTimeframe:
      "Please complete the investigation within the applicable statutory response period and provide the updated disclosure or correction notice.",
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
    subject: "TransUnion dispute and reinvestigation request - {{creditorName}} {{accountNumber}}",
    introduction:
      "I am disputing the TransUnion reporting of the account identified below. The file information appears inaccurate, incomplete, inconsistent with the supporting records, or not properly verified. Please investigate the disputed information and send the investigation results in writing.",
    statutoryGrounds:
      "This dispute is submitted under applicable consumer reporting legislation and privacy duties requiring reasonable procedures, source verification, and correction or deletion of inaccurate information.",
    requestedAction:
      "Please confirm the reporting source, review the account-level evidence, correct or delete unsupported information, update the consumer disclosure, and identify the information provider relied on for any item that remains.",
    statutoryTimeframe:
      "Please complete the investigation within the applicable statutory response period and provide written confirmation of all corrections or reasons for retaining the item.",
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
    subject: "Credit reporting dispute - {{bureauName}} - {{creditorName}} {{accountNumber}}",
    introduction:
      "I am submitting a dispute regarding the account information identified below. The reporting appears inaccurate, incomplete, unverifiable, or inconsistent with the available account evidence and should be reinvestigated before it continues to appear on my consumer disclosure.",
    statutoryGrounds:
      "This request relies on applicable consumer reporting legislation, provincial consumer reporting duties, and privacy accuracy obligations requiring consumer reporting data to be accurate, complete, and verifiable.",
    requestedAction:
      "Please investigate the disputed account, verify the source documentation, correct each inaccurate field, delete any information that cannot be verified, and provide written confirmation of the results.",
    statutoryTimeframe:
      "Please respond within the statutory period that applies in {{province}} and provide an updated disclosure or correction notice.",
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
    subject: `${provinceLabel} provincial credit reporting dispute - {{creditorName}} {{accountNumber}}`,
    introduction:
      `I am submitting this dispute under the ${statuteLabel}. The account identified below appears inaccurate, incomplete, unverifiable, or not supported by the reporting record for {{province}}.`,
    statutoryGrounds:
      `The ${statuteLabel} and related consumer reporting/privacy obligations require credit reporting information to be accurate, complete, current, and supported by reasonable verification.`,
    requestedAction:
      "Please investigate the disputed information, review the source records, correct or delete unsupported data, update any recipient bureau or furnisher records, and send written results describing the verification relied on.",
    statutoryTimeframe:
      `Please complete the review within the response period that applies under the ${statuteLabel} or the applicable provincial process for {{province}}.`,
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
    subject: `Compliance finding: ${label} - {{creditorName}} {{accountNumber}}`,
    introduction:
      `This finding concerns whether ${focus}. Treat this language as a compliance finding that must be tied to the uploaded report, source evidence, investigation history, and response packet before final use.`,
    statutoryGrounds:
      "Use the applicable statute, regulation, guidance, or policy basis recorded for this finding: {{statutoryReference}}.",
    requestedAction:
      "Review the evidence for this account, confirm the specific field or conduct at issue, request verification or correction from the responsible party, and revise or remove this narrative if the source evidence does not support it.",
    statutoryTimeframe: null,
    consumerStatementRight: null,
    certification: null,
    closing: null,
    fullBodyOverride: null,
    statutoryReference: "{{statutoryReference}}",
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
  defaults: DefaultLetterTemplate
): Partial<DefaultLetterTemplate> {
  const patch: Partial<DefaultLetterTemplate> = {};
  const existingHasContent = hasLetterTemplateContent(existing);

  if (!existingHasContent && existing.label !== defaults.label) {
    patch.label = defaults.label;
  }

  for (const field of LETTER_TEMPLATE_DEFAULT_FIELDS) {
    const defaultValue = defaults[field];
    if (defaultValue !== null && isBlankText(existing[field])) {
      patch[field] = defaultValue;
    }
  }

  return patch;
}
