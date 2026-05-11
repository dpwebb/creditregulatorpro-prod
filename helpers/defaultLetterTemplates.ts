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
  "I certify that I am submitting this dispute in good faith and that the information provided is accurate to the best of my knowledge.";

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
      "I am writing to dispute and ask Equifax to reinvestigate the item identified below. Please correct or remove any information that cannot be verified and provide the results in writing.",
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
      "I am writing to dispute and ask TransUnion to reinvestigate the item identified below. Please correct or remove any information that cannot be verified and provide the results in writing.",
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
      "I am writing to dispute and ask {{bureauName}} to reinvestigate the item identified below. Please correct or remove any information that cannot be verified and provide the results in writing.",
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

type ViolationNarrativeDetail = {
  disputedFields: string;
  factualBasis: string;
  evidenceToCompare: string;
  requestedCorrection: string;
};

const VIOLATION_NARRATIVE_DETAILS: Record<string, ViolationNarrativeDetail> = {
  statute_of_limitations: {
    disputedFields: "reporting period, date of first delinquency, date of last payment, date of last activity, and collection status",
    factualBasis:
      "the account chronology may show that the item is obsolete, time-barred, or being reported beyond the period supported by the source dates",
    evidenceToCompare:
      "the consumer disclosure, original account statements, payment records, charge-off records, collection assignment records, and any limitation-period or retention-period records",
    requestedCorrection:
      "correct the reporting dates and status, or delete/suppress the tradeline if the reporting period cannot be verified from source records",
  },
  bankruptcy_discharge_violation: {
    disputedFields: "bankruptcy/proposal notation, account status, balance, past-due amount, collection status, and discharge treatment",
    factualBasis:
      "the account may still report as collectible, past due, open, charged off, or outstanding after a bankruptcy discharge or consumer proposal event",
    evidenceToCompare:
      "bankruptcy discharge records, consumer proposal documents, trustee correspondence, creditor account records, and the bureau disclosure page showing the account",
    requestedCorrection:
      "update the account to reflect the insolvency status accurately, correct any balance/status fields that conflict with the discharge, and remove unverifiable post-discharge collection reporting",
  },
  identity_theft_violation: {
    disputedFields: "account ownership, opening authorization, inquiry authorization, address/identity match, and fraud or identity-theft block status",
    factualBasis:
      "the account or inquiry may not belong to the consumer and may be tied to unauthorized use of identity information",
    evidenceToCompare:
      "identity-theft report or police report, government ID, address proof, bureau identity file, creditor application records, account-opening records, and inquiry authorization records",
    requestedCorrection:
      "block or suppress unauthorized information, remove unauthorized inquiries, and provide the furnisher/source records used to verify any item that remains",
  },
  documentation_chain_failure: {
    disputedFields: "original creditor identity, collector identity, account ownership, assignment chain, balance authority, and verification documentation",
    factualBasis:
      "the account may not be traceable from the named furnisher or collector back to a valid original creditor and enforceable source obligation",
    evidenceToCompare:
      "original contract, charge-off record, bill of sale, assignment agreement, collector placement record, itemized balance record, and furnisher verification response",
    requestedCorrection:
      "identify the true original creditor and assignment chain, correct any misidentified creditor/collector fields, and delete/suppress the tradeline if ownership and balance authority cannot be documented",
  },
  balance_calculation_violation: {
    disputedFields: "reported balance, current balance, past-due amount, charge-off amount, fees, interest, and payment credits",
    factualBasis:
      "the balance fields may not reconcile to payments, settlement records, charge-off records, fees, interest, or the creditor's final statement",
    evidenceToCompare:
      "monthly statements, payment confirmations, settlement letters, payoff records, charge-off records, fee schedules, and collector itemization records",
    requestedCorrection:
      "correct each balance-related field to the documented amount, remove unsupported fees or interest, and delete/suppress any amount that cannot be verified from itemized source records",
  },
  bureau_investigation_failure: {
    disputedFields: "investigation result, disputed account fields, method of verification, furnisher response, and correction decision",
    factualBasis:
      "the bureau response may have kept or confirmed reporting without showing field-level review of the consumer's specific dispute evidence",
    evidenceToCompare:
      "the original dispute letter, exhibits submitted, bureau response, furnisher response, method-of-verification notes, and updated disclosure",
    requestedCorrection:
      "conduct a new field-level reinvestigation, address each disputed item separately, provide the method of verification, and correct/delete any field not verified from source documentation",
  },
  bureau_notification_failure: {
    disputedFields: "dispute-result notice, correction notice, updated disclosure, recipient notification, and response date",
    factualBasis:
      "the consumer may not have received the written results, correction notice, updated disclosure, or required downstream notice after a dispute or correction",
    evidenceToCompare:
      "mailing records, portal messages, bureau response letters, dispute submission records, correction records, and disclosure history",
    requestedCorrection:
      "provide the missing notice or updated disclosure, document the date and method of delivery, and identify any recipients notified of corrections",
  },
  bureau_dispute_marking_failure: {
    disputedFields: "dispute notation, account status during investigation, bureau comment codes, and furnisher dispute flag",
    factualBasis:
      "the account may not have been marked as disputed while an active bureau or furnisher investigation was pending",
    evidenceToCompare:
      "dispute submission date, bureau file snapshots before/during/after investigation, furnisher ACDV or response records, and account comment/status history",
    requestedCorrection:
      "add or restore the appropriate dispute notation for the investigated period, correct any status affected by missing dispute marking, and provide written confirmation",
  },
  bureau_reinsertion_violation: {
    disputedFields: "reinserted tradeline or field, reinsertion date, prior deletion record, verification source, and consumer notice",
    factualBasis:
      "information previously removed may have reappeared without documented certification of accuracy or notice to the consumer",
    evidenceToCompare:
      "prior deletion/correction notice, current disclosure, reinsertion date, furnisher certification or source record, and bureau notice records",
    requestedCorrection:
      "remove the reinserted item unless the bureau can provide the required verification basis and notice trail, and identify the source that caused the reinsertion",
  },
  bureau_access_violation: {
    disputedFields: "hard inquiry, soft inquiry, access date, requesting entity, permissible purpose, and consumer authorization",
    factualBasis:
      "a bureau file access or inquiry may not be tied to a valid application, account review, collection purpose, consumer request, or other permissible basis",
    evidenceToCompare:
      "inquiry record, requesting entity identity, application/authorization record, account-review basis, collection placement record, and security-freeze status if applicable",
    requestedCorrection:
      "remove or suppress unauthorized inquiries and provide the requesting entity, purpose, date, and source authorization for any access that remains",
  },
  furnisher_reaging_violation: {
    disputedFields: "date of first delinquency, date of last activity, opened date, reported date, charge-off date, and payment history chronology",
    factualBasis:
      "the reported dates may make the delinquency appear newer than supported by the original account chronology",
    evidenceToCompare:
      "original delinquency records, payment history, charge-off records, account statements, collection transfer records, and prior bureau disclosures",
    requestedCorrection:
      "restore the documented original delinquency chronology, correct any re-aged date fields, and delete/suppress the tradeline if the aging basis cannot be verified",
  },
  temporal_manipulation: {
    disputedFields: "opened date, closed date, last activity date, last payment date, reported date, and date of first delinquency",
    factualBasis:
      "one or more account dates may conflict with each other or with the documented account sequence",
    evidenceToCompare:
      "account-opening records, monthly statements, payment records, closure records, collection transfer records, and bureau reporting history",
    requestedCorrection:
      "correct each inconsistent date field to match the source chronology and provide source records for any date that remains disputed",
  },
  account_status_inconsistency: {
    disputedFields: "account status, open/closed indicator, balance, past-due amount, payment rating, and collection/charge-off status",
    factualBasis:
      "the account status may conflict with balance, closure, payment, collection, or charge-off fields in the same disclosure or across reporting periods",
    evidenceToCompare:
      "current and prior disclosures, creditor account statements, closure records, payment records, charge-off records, and furnisher status-code history",
    requestedCorrection:
      "correct the status and related balance/payment fields so they agree with the source records, or suppress any unsupported status field",
  },
  furnisher_status_code_mismatch: {
    disputedFields: "payment rating, status code, narrative status, account type, responsibility code, and balance",
    factualBasis:
      "the furnisher's coded status may not match the plain-language account status, balance, payment history, or responsibility shown elsewhere",
    evidenceToCompare:
      "furnisher reporting history, account statements, payment ledger, Metro 2-style field mapping, and bureau disclosure narrative",
    requestedCorrection:
      "align the status code and narrative status with the documented account state and provide source verification for any retained code",
  },
  collector_license_failure: {
    disputedFields: "collector identity, collection authority, jurisdiction, collection status, and reporting authority",
    factualBasis:
      "the collector reporting or collecting the account may not have documented authority or licensing for the consumer's jurisdiction and activity",
    evidenceToCompare:
      "collector license records, jurisdiction records, collection assignment records, creditor placement records, and bureau reporting history",
    requestedCorrection:
      "identify the licensed collector and authority for reporting, correct the collector identity/status, and delete/suppress reporting if authority cannot be verified",
  },
  collector_unauthorized_fees: {
    disputedFields: "reported balance, fees, interest, collection costs, past-due amount, and itemized debt total",
    factualBasis:
      "the collector may be reporting fees, interest, or collection costs that are not supported by contract, judgment, statute, or account records",
    evidenceToCompare:
      "original agreement, judgment if any, itemized debt statement, payment ledger, fee schedule, collector balance calculation, and settlement records",
    requestedCorrection:
      "remove unsupported fees/interest/costs, correct the itemized balance, and provide source authority for every amount that remains",
  },
  collector_duplicate_reporting: {
    disputedFields: "duplicate tradeline, collector identity, account number, original creditor, balance, and collection status",
    factualBasis:
      "the same debt may be reported more than once by the same collector, successor collector, or overlapping collection tradelines",
    evidenceToCompare:
      "all related tradelines, original creditor records, account numbers, assignment dates, collector placement records, and balance itemizations",
    requestedCorrection:
      "remove duplicate reporting, identify the single verified reporting party if any, and correct balances/statuses so the obligation is not overstated",
  },
  collector_payment_acknowledgment_violation: {
    disputedFields: "payment credits, settlement status, paid/closed status, balance, past-due amount, and last payment date",
    factualBasis:
      "payments, settlements, credits, or acknowledgments may not be reflected in the current balance or status",
    evidenceToCompare:
      "payment receipts, bank records, cancelled cheques, settlement letters, creditor/collector ledger, and updated account statements",
    requestedCorrection:
      "apply documented payments or settlements, correct balance/status/date fields, and remove any unsupported outstanding amount",
  },
  response_mov_missing: {
    disputedFields: "method of verification, furnisher identity, source documents, verification date, and retained disputed fields",
    factualBasis:
      "the response may state that the item was verified without explaining how, by whom, or against which source records",
    evidenceToCompare:
      "bureau response, furnisher response, ACDV or equivalent verification record, source documents, and consumer dispute exhibits",
    requestedCorrection:
      "provide the method of verification and source basis for each retained field, or complete a new reinvestigation and correct/delete unverifiable data",
  },
  response_incomplete: {
    disputedFields: "unanswered disputed fields, requested corrections, submitted evidence, and written dispute findings",
    factualBasis:
      "the response may address only part of the dispute and omit one or more disputed fields, exhibits, or requested corrections",
    evidenceToCompare:
      "the consumer's dispute letter, exhibit index, bureau response, furnisher response, and updated disclosure",
    requestedCorrection:
      "respond to each disputed field separately, identify the evidence reviewed, and correct/delete any field not supported by source records",
  },
  response_no_documentation: {
    disputedFields: "source documents, account contract, payment ledger, assignment records, balance records, and verification support",
    factualBasis:
      "the response may confirm the item without producing or describing documents sufficient to verify the disputed reporting",
    evidenceToCompare:
      "source contracts, statements, payment ledger, assignment records, creditor/collector correspondence, and bureau/furnisher verification notes",
    requestedCorrection:
      "produce or describe the source documentation relied on for each retained field, and delete/suppress any item that cannot be documented",
  },
  response_address_mismatch: {
    disputedFields: "consumer address, account address, response mailing address, identity match, and mixed-file indicators",
    factualBasis:
      "the response or account may rely on an address that does not match the consumer's identity or file history",
    evidenceToCompare:
      "government ID, address proof, bureau personal information section, account application address, response envelope/address, and prior disclosures",
    requestedCorrection:
      "correct address-linked identity data, investigate mixed-file risk, and suppress accounts or responses tied to an unverifiable address match",
  },
  response_unauthorized: {
    disputedFields: "authorization source, responding entity, account ownership, consent record, and furnisher authority",
    factualBasis:
      "the response may rely on an entity or authorization that does not match the consumer, account, or consent evidence",
    evidenceToCompare:
      "consumer authorization records, creditor/furnisher identity records, account application, consent withdrawal records, and dispute response source",
    requestedCorrection:
      "identify the authorized source, correct account ownership or authorization fields, and suppress any reporting not tied to valid authority",
  },
  disclosure_deficiency: {
    disputedFields: "consumer disclosure content, source information, creditor/furnisher identity, rights notices, and omitted account fields",
    factualBasis:
      "the disclosure may be missing required information needed to understand, verify, or dispute the reported data",
    evidenceToCompare:
      "the complete consumer disclosure, raw report pages, bureau source-information records, account tradeline details, and rights-notice text",
    requestedCorrection:
      "provide a complete disclosure, identify the source of each disputed item, and correct any account fields that cannot be fully disclosed or verified",
  },
  cross_entity_discrepancy: {
    disputedFields: "same-account balance, status, dates, ownership, payment history, and collector/furnisher identity across entities",
    factualBasis:
      "the same account may be reported differently by bureaus, furnishers, collectors, or source documents",
    evidenceToCompare:
      "Equifax disclosure, TransUnion disclosure, creditor records, collector records, source statements, and prior dispute responses",
    requestedCorrection:
      "resolve the discrepancy to the documented source value, identify the entity supplying each value, and correct/delete any unsupported version",
  },
  multiple_collector_violation: {
    disputedFields: "collector identity, duplicate collector tradelines, account ownership, assignment date, balance, and collection status",
    factualBasis:
      "more than one collector may be reporting or validating the same obligation without a clear current owner or assignment trail",
    evidenceToCompare:
      "collector assignment records, creditor placement records, duplicate tradelines, collector correspondence, account numbers, and balance itemizations",
    requestedCorrection:
      "identify the single current reporting party if verified, remove duplicate collector reporting, and correct any overstated balance or status",
  },
  phantom_debt_unverifiable: {
    disputedFields: "creditor identity, account number, original contract, assignment chain, balance, and consumer obligation",
    factualBasis:
      "the account may not be traceable to a valid original creditor, contract, purchase/assignment record, or consumer obligation",
    evidenceToCompare:
      "original creditor records, signed agreement or application, statements, assignment records, itemized balance, and collector validation documents",
    requestedCorrection:
      "verify the debt from original source documents or delete/suppress the tradeline and any related collection notation",
  },
  zombie_debt_resurrection: {
    disputedFields: "reappeared account, reporting date, last activity date, collection status, balance, and prior closure/deletion status",
    factualBasis:
      "old, deleted, settled, paid, or otherwise resolved debt may have reappeared or been updated without a current verification basis",
    evidenceToCompare:
      "prior disclosures, deletion/correction notices, settlement or payment records, last activity records, assignment records, and current disclosure",
    requestedCorrection:
      "remove the resurrected reporting unless the bureau can document a current permissible reporting basis and accurate date chronology",
  },
  stale_reporting_failure: {
    disputedFields: "obsolete account status, reporting date, date of first delinquency, date closed, last activity date, and retention-period basis",
    factualBasis:
      "outdated or obsolete information may still be present after the age or retention period supported by the account chronology",
    evidenceToCompare:
      "first delinquency records, closure records, last payment/activity records, prior disclosures, and statutory retention references",
    requestedCorrection:
      "correct obsolete dates/statuses and delete/suppress any reporting that is too old or cannot be tied to a valid retention basis",
  },
  credit_limit_manipulation: {
    disputedFields: "credit limit, high credit, balance, utilization-related fields, account type, and reported status",
    factualBasis:
      "credit limit or high-credit values may be missing, understated, overstated, or changed in a way that distorts account utilization",
    evidenceToCompare:
      "credit agreements, monthly statements, limit-change notices, high-credit records, balance history, and bureau tradeline fields",
    requestedCorrection:
      "correct the limit/high-credit fields to the documented source value or suppress unsupported utilization-affecting fields",
  },
  closed_account_balance_inflation: {
    disputedFields: "closed status, balance, past-due amount, date closed, charge-off amount, and transfer/sale status",
    factualBasis:
      "a closed, transferred, paid, discharged, or sold account may still show an inflated balance or past-due amount",
    evidenceToCompare:
      "closure records, final statements, transfer/sale records, payment records, charge-off records, and collector assignment records",
    requestedCorrection:
      "correct the balance/status combination to match the closure or transfer records and suppress any unsupported balance",
  },
  last_activity_date_manipulation: {
    disputedFields: "last activity date, last payment date, reported date, date of first delinquency, and account aging",
    factualBasis:
      "the last activity date may have been moved or reported in a way that affects age, retention, or collection interpretation",
    evidenceToCompare:
      "payment records, transaction ledger, monthly statements, charge-off records, collection placement records, and prior disclosures",
    requestedCorrection:
      "restore the documented last activity/payment chronology and delete/suppress any date field that cannot be verified",
  },
  consumer_statement_suppression: {
    disputedFields: "consumer statement, dispute notation, explanatory comment, statement date, and account comment codes",
    factualBasis:
      "a consumer statement or dispute notation may have been omitted, removed, shortened, or not attached to the relevant file item",
    evidenceToCompare:
      "consumer statement submission, bureau confirmation, current disclosure, prior disclosure, account comments, and dispute history",
    requestedCorrection:
      "add or restore the consumer statement/dispute notation and provide written confirmation of where it appears in the file",
  },
  retroactive_history_manipulation: {
    disputedFields: "historical payment status, month-by-month ratings, status history, reported dates, and correction history",
    factualBasis:
      "historical fields may have changed after the fact without supporting account records or a documented correction basis",
    evidenceToCompare:
      "prior bureau disclosures, current disclosure, creditor payment ledger, monthly statements, correction history, and furnisher reporting history",
    requestedCorrection:
      "restore or correct the historical fields to match source records and identify the source and date of any retroactive change",
  },
  payment_history_manipulation: {
    disputedFields: "monthly payment history, late-payment markers, payment rating, date of last payment, and delinquency sequence",
    factualBasis:
      "late-payment history or payment ratings may not match actual payment records or prior reporting",
    evidenceToCompare:
      "payment receipts, bank records, monthly statements, creditor ledger, prior disclosures, and furnisher reporting history",
    requestedCorrection:
      "correct each inaccurate monthly payment marker and provide source records for any late-payment notation that remains",
  },
  investigation_rubber_stamp: {
    disputedFields: "investigation procedure, furnisher verification, disputed fields reviewed, evidence considered, and response rationale",
    factualBasis:
      "the investigation may appear conclusory or automated because it confirms reporting without addressing the specific field-level evidence",
    evidenceToCompare:
      "the dispute package, exhibit index, bureau investigation notes, furnisher response, method-of-verification record, and final response",
    requestedCorrection:
      "perform a substantive field-level reinvestigation, identify records reviewed for each disputed field, and correct/delete unsupported reporting",
  },
  furnisher_joint_account_violation: {
    disputedFields: "account responsibility, joint/individual/co-signer status, ownership, authorization, and balance responsibility",
    factualBasis:
      "the consumer may be reported as jointly responsible, co-signer, or primary obligor when source records do not support that relationship",
    evidenceToCompare:
      "credit application, account agreement, signature records, authorized user records, creditor responsibility code, and bureau tradeline responsibility field",
    requestedCorrection:
      "correct the responsibility code and ownership status, remove unsupported liability reporting, and provide the source agreement if responsibility remains",
  },
  furnisher_authorized_user_misrepresentation: {
    disputedFields: "authorized user status, responsibility code, ownership status, balance liability, and payment history attribution",
    factualBasis:
      "an authorized-user relationship may be reported as if the consumer is contractually liable or may fail to distinguish the primary obligor",
    evidenceToCompare:
      "account agreement, authorized-user records, primary cardholder records, responsibility codes, statements, and bureau tradeline ownership fields",
    requestedCorrection:
      "correct the account to accurately show authorized-user status or remove unsupported responsibility/balance reporting",
  },
  furnisher_post_dispute_retaliation: {
    disputedFields: "post-dispute status changes, balance changes, late markers, collection updates, reinsertion, and reporting dates",
    factualBasis:
      "reporting may have worsened, reappeared, or changed after a dispute without a documented account event supporting the change",
    evidenceToCompare:
      "pre-dispute disclosure, dispute submission, post-dispute disclosure, furnisher updates, account ledger, and correction/reinsertion records",
    requestedCorrection:
      "reverse unsupported post-dispute changes, identify the source event for any retained change, and correct/delete unverifiable updated reporting",
  },
  collector_statute_revival_attempt: {
    disputedFields: "last payment date, acknowledgment date, limitation-period status, collection status, balance, and reporting date",
    factualBasis:
      "collector reporting or communication may imply that an old debt was revived or remains enforceable without source evidence of a valid payment or acknowledgment",
    evidenceToCompare:
      "payment records, written acknowledgment records, collector letters, limitation-period records, account ledger, and bureau reporting history",
    requestedCorrection:
      "correct limitation-period and activity-date fields, remove unsupported revival implications, and suppress reporting that cannot be verified from source chronology",
  },
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
    return `Statutory grounds relied on for this dispute:

1. Bankruptcy and Insolvency Act, s.178(2). Relevant statutory text or authority excerpt: "${BIA_DISCHARGE_TEXT}" Application to this account: post-discharge reporting must accurately reflect the legal status of any provable claim.

2. ${provincialReference}`;
  }

  if (ACCESS_OR_IDENTITY_KEYS.has(key)) {
    return `Statutory grounds relied on for this dispute:

1. PIPEDA, Schedule 1, Principle 4.3. Relevant statutory text or authority excerpt: "${PIPEDA_CONSENT_TEXT}" Application to this account: access, disclosure, account ownership, or identity-theft handling must be supported by consent, authorization, or a lawful exception.

2. PIPEDA, Schedule 1, Principle 4.7. Relevant statutory text or authority excerpt: "${PIPEDA_SAFEGUARDS_TEXT}" Application to this account: sensitive consumer-reporting information must be protected against inappropriate access or misuse.

3. ${provincialReference}`;
  }

  if (RETENTION_OR_TIME_KEYS.has(key)) {
    return `Statutory grounds relied on for this dispute:

1. PIPEDA, Schedule 1, Principle 4.5. Relevant statutory text or authority excerpt: "${PIPEDA_RETENTION_TEXT}" Application to this account: obsolete or time-sensitive reporting must be supported by a valid retention and reporting-period basis.

2. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: date-dependent reporting must be accurate, complete, and current for the purpose for which it is used.

3. ${provincialReference}`;
  }

  if (RESPONSE_OR_INVESTIGATION_KEYS.has(key)) {
    return `Statutory grounds relied on for this dispute:

1. PIPEDA, Schedule 1, Principle 4.10. Relevant statutory text or authority excerpt: "${PIPEDA_CHALLENGE_TEXT}" Application to this account: the dispute response should address the consumer's specific challenge and show the basis for maintaining, correcting, or updating the reporting.

2. PIPEDA, Schedule 1, Principle 4.9. Relevant statutory text or authority excerpt: "${PIPEDA_ACCESS_TEXT}" Application to this account: the consumer should receive enough information to understand the existence, use, source basis, and handling of the disputed personal information.

3. ${provincialReference}`;
  }

  if (COLLECTION_KEYS.has(key)) {
    return `Statutory grounds relied on for this dispute:

1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "${PIPEDA_ACCURACY_TEXT}" Application to this account: collection-account reporting must accurately reflect the creditor, balance, assignment, payment, fee, and ownership evidence used to make decisions about the consumer.

2. ${provincialReference}`;
  }

  if (key === "consent_withdrawal_not_honored") {
    return `Statutory grounds relied on for this dispute:

1. PIPEDA, Schedule 1, Principle 4.3.8. Relevant statutory text or authority excerpt: "An individual may withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice, and the organization must inform the individual of the implications." Application to this account: continued reporting after withdrawal must be reviewed against the consent record and any lawful basis for continued processing.

2. ${provincialReference}`;
  }

  return `Statutory grounds relied on for this dispute:

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
      `I am writing to dispute and ask for reinvestigation under the ${statuteLabel}. Please correct or remove any information that cannot be verified and provide the results in writing.`,
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
  const statutoryGrounds = `${buildViolationStatutoryGrounds(key)}

Field-level application:
The disputed field is {{disputedField}}. The reported value is {{reportedValue}}. The expected or source-supported value is {{expectedValue}}. This authority is relied on only for the field/value issue identified in this dispute.`;

  return {
    category: "violation_narrative",
    templateKey: key,
    label,
    subject: `Formal Dispute and Reinvestigation Request - ${label}`,
    introduction:
      `Disputed field/value: {{disputedField}} = {{reportedValue}}. Issue: {{specificIssue}}`,
    statutoryGrounds,
    requestedAction:
      "Requested correction by disputed field: {{specificRemedy}} If unverifiable, delete, remove, or suppress the tradeline.",
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
    ...Object.keys(VIOLATION_NARRATIVE_DETAILS).map(buildViolationTemplate),
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
