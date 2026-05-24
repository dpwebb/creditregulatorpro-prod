export const CANONICAL_DISPUTE_INTENTS = [
  "INCOMPLETE_COLLECTION_REPORTING",
  "UNVERIFIABLE_COLLECTION_IDENTITY",
  "INCONSISTENT_PAYMENT_REPORTING",
  "OBSOLETE_REPORTING",
  "INCONSISTENT_BALANCE_REPORTING",
  "INCONSISTENT_STATUS_REPORTING",
  "DATE_ACCURACY_REVIEW",
  "REPORTING_CHRONOLOGY_CONFLICT",
  "MISSING_ACCOUNT_IDENTIFIER",
  "UNSUPPORTED_REPORTING",
  "DUPLICATE_REPORTING",
  "IDENTITY_OR_OWNERSHIP_MISMATCH",
  "ACCOUNT_OWNERSHIP_AMBIGUITY",
  "GENERAL_ACCURACY_REVIEW",
] as const;

export type CanonicalDisputeIntent = (typeof CANONICAL_DISPUTE_INTENTS)[number];

export type CanonicalPacketRequestedAction =
  | "correct inaccurate information"
  | "remove unsupported information"
  | "verify and provide basis"
  | "update stale information"
  | "correct duplicate account"
  | "correct balance"
  | "correct payment history"
  | "correct account status"
  | "correct date"
  | "correct personal information"
  | "clarify collection authority/details"
  | "verify collection details";

export interface DisputeIntentInput {
  issueType?: string | null;
  violationCategory?: string | null;
  disputeVector?: string | null;
  disputedField?: string | null;
  disputeCategory?: string | null;
  packetType?: string | null;
  accountNumberMissing?: boolean | null;
  isCollectionAccount?: boolean | null;
}

export interface DisputeIntentArchetype {
  intent: CanonicalDisputeIntent;
  label: string;
  consumerNarrative: string;
  requestedAction: CanonicalPacketRequestedAction;
  bureauActionSentence: string;
  evidenceSentence?: string;
  escalationTone?: "neutral" | "firm" | "review";
}

export const NARRATIVE_ARCHETYPE_REGISTRY: Record<CanonicalDisputeIntent, DisputeIntentArchetype> = {
  INCOMPLETE_COLLECTION_REPORTING: {
    intent: "INCOMPLETE_COLLECTION_REPORTING",
    label: "Incomplete collection reporting",
    consumerNarrative:
      "I cannot verify who is reporting or collecting this account because identifying information is incomplete.",
    requestedAction: "verify collection details",
    bureauActionSentence:
      "Please verify who is reporting or collecting this account and correct or remove it if the reporting cannot be supported.",
    evidenceSentence: "Relevant report section for the incomplete collection information.",
    escalationTone: "neutral",
  },
  UNVERIFIABLE_COLLECTION_IDENTITY: {
    intent: "UNVERIFIABLE_COLLECTION_IDENTITY",
    label: "Unverifiable collection identity",
    consumerNarrative:
      "I cannot verify the collection agency identity or its connection to this account from the information shown.",
    requestedAction: "verify collection details",
    bureauActionSentence:
      "Please verify the collection identity and supporting records, and correct or remove the item if it cannot be supported.",
    evidenceSentence: "Relevant report section for the collection identity information.",
    escalationTone: "review",
  },
  INCONSISTENT_PAYMENT_REPORTING: {
    intent: "INCONSISTENT_PAYMENT_REPORTING",
    label: "Payment history reporting",
    consumerNarrative: "The payment history being reported does not appear to match my records.",
    requestedAction: "correct payment history",
    bureauActionSentence:
      "Please investigate the reported payment history and correct it, or remove the item if it cannot be verified.",
    evidenceSentence: "Relevant report section for the payment history information.",
    escalationTone: "neutral",
  },
  OBSOLETE_REPORTING: {
    intent: "OBSOLETE_REPORTING",
    label: "Reporting period review",
    consumerNarrative:
      "This account appears to remain on my credit file beyond the appropriate reporting period.",
    requestedAction: "update stale information",
    bureauActionSentence:
      "Please investigate whether this item should continue to appear on the current report, and update or remove it if it cannot be verified.",
    evidenceSentence: "Relevant report section for the reporting-period information.",
    escalationTone: "neutral",
  },
  INCONSISTENT_BALANCE_REPORTING: {
    intent: "INCONSISTENT_BALANCE_REPORTING",
    label: "Balance reporting",
    consumerNarrative: "The balance being reported does not appear accurate based on my records.",
    requestedAction: "correct balance",
    bureauActionSentence:
      "Please investigate the reported balance and correct it, or remove the item if it cannot be verified.",
    evidenceSentence: "Relevant report section for the balance information.",
    escalationTone: "neutral",
  },
  INCONSISTENT_STATUS_REPORTING: {
    intent: "INCONSISTENT_STATUS_REPORTING",
    label: "Account status reporting",
    consumerNarrative:
      "The account status being reported does not appear to match the account records.",
    requestedAction: "correct account status",
    bureauActionSentence:
      "Please investigate the account status and correct it, or remove the item if it cannot be verified.",
    evidenceSentence: "Relevant report section for the account status information.",
    escalationTone: "neutral",
  },
  DATE_ACCURACY_REVIEW: {
    intent: "DATE_ACCURACY_REVIEW",
    label: "Date reporting",
    consumerNarrative: "The date information being reported does not appear accurate or complete.",
    requestedAction: "correct date",
    bureauActionSentence:
      "Please investigate the reported date information and correct it, or remove the item if it cannot be verified.",
    evidenceSentence: "Relevant report section for the date information.",
    escalationTone: "neutral",
  },
  REPORTING_CHRONOLOGY_CONFLICT: {
    intent: "REPORTING_CHRONOLOGY_CONFLICT",
    label: "Reporting chronology conflict",
    consumerNarrative:
      "The account dates being reported do not appear consistent with the account history.",
    requestedAction: "correct date",
    bureauActionSentence:
      "Please investigate the account dates and correct them, or remove the item if they cannot be verified.",
    evidenceSentence: "Relevant report section for the account date information.",
    escalationTone: "review",
  },
  MISSING_ACCOUNT_IDENTIFIER: {
    intent: "MISSING_ACCOUNT_IDENTIFIER",
    label: "Missing account identifier",
    consumerNarrative:
      "The account number is not shown on my report, so I am asking the bureau to verify the account before it continues to be reported.",
    requestedAction: "verify and provide basis",
    bureauActionSentence:
      "Please verify the account identifier and supporting records, and correct or remove the item if it cannot be verified.",
    evidenceSentence: "Relevant report section for the account identifier.",
    escalationTone: "neutral",
  },
  UNSUPPORTED_REPORTING: {
    intent: "UNSUPPORTED_REPORTING",
    label: "Unsupported reporting",
    consumerNarrative:
      "I am asking the bureau to verify that this account is supported by records before it continues to be reported.",
    requestedAction: "remove unsupported information",
    bureauActionSentence:
      "Please remove this information if the records supporting it cannot be verified.",
    evidenceSentence: "Relevant report section for the disputed information.",
    escalationTone: "neutral",
  },
  DUPLICATE_REPORTING: {
    intent: "DUPLICATE_REPORTING",
    label: "Duplicate reporting",
    consumerNarrative:
      "This account appears to be reported more than once, which may be inaccurately affecting my file.",
    requestedAction: "correct duplicate account",
    bureauActionSentence:
      "Please investigate whether this account is duplicated and correct or remove any duplicate reporting.",
    evidenceSentence: "Relevant report section for the duplicate account information.",
    escalationTone: "neutral",
  },
  IDENTITY_OR_OWNERSHIP_MISMATCH: {
    intent: "IDENTITY_OR_OWNERSHIP_MISMATCH",
    label: "Identity or ownership review",
    consumerNarrative:
      "This information may belong to another individual or may not be connected to me as reported.",
    requestedAction: "correct personal information",
    bureauActionSentence:
      "Please investigate whether this information belongs on my credit file and correct or remove it if it cannot be verified.",
    evidenceSentence: "Relevant report section for the identity or ownership information.",
    escalationTone: "neutral",
  },
  ACCOUNT_OWNERSHIP_AMBIGUITY: {
    intent: "ACCOUNT_OWNERSHIP_AMBIGUITY",
    label: "Account ownership ambiguity",
    consumerNarrative:
      "I am asking the bureau to verify that this account is connected to me and to the company reporting it.",
    requestedAction: "verify and provide basis",
    bureauActionSentence:
      "Please verify the account ownership and reporting basis, and correct or remove the item if it cannot be verified.",
    evidenceSentence: "Relevant report section for the account ownership information.",
    escalationTone: "review",
  },
  GENERAL_ACCURACY_REVIEW: {
    intent: "GENERAL_ACCURACY_REVIEW",
    label: "Accuracy review",
    consumerNarrative:
      "I am disputing this item because the information being reported appears inaccurate or incomplete.",
    requestedAction: "verify and provide basis",
    bureauActionSentence:
      "Please investigate this item, provide the basis for any information that remains, and correct or remove it if it cannot be verified.",
    evidenceSentence: "Relevant report section for the disputed information.",
    escalationTone: "neutral",
  },
};

export const DISPUTE_INTENT_ARCHETYPES = NARRATIVE_ARCHETYPE_REGISTRY;

function normalizedText(...values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function disputeIntentArchetypeFor(intent: CanonicalDisputeIntent): DisputeIntentArchetype {
  return NARRATIVE_ARCHETYPE_REGISTRY[intent];
}

export function canonicalDisputeIntentFor(input: DisputeIntentInput = {}): CanonicalDisputeIntent {
  const issueText = normalizedText(input.issueType);
  const text = normalizedText(
    input.issueType,
    input.violationCategory,
    input.disputeVector,
    input.disputedField,
    input.disputeCategory,
  );
  const field = normalizedText(input.disputedField);

  if (
    hasAny(text, [
      "MISSING COLLECTION AGENCY NAME",
      "COLLECTION AGENCY NAME",
      "INCOMPLETE COLLECTION",
      "COLLECTION OR DEFAULT STATUS",
    ]) ||
    input.isCollectionAccount === true
  ) {
    return "INCOMPLETE_COLLECTION_REPORTING";
  }

  if (
    hasAny(text, [
      "UNVERIFIABLE COLLECTION IDENTITY",
      "COLLECTION IDENTITY VERIFICATION",
      "COLLECTOR LICENSE",
      "COLLECTION AUTHORITY",
      "PHANTOM DEBT",
    ])
  ) {
    return "UNVERIFIABLE_COLLECTION_IDENTITY";
  }

  if (
    hasAny(text, [
      "MULTIPLE COLLECTOR",
      "COLLECTION REPORTING AMBIGUITY",
      "ACCOUNT OWNERSHIP AMBIGUITY",
      "OWNERSHIP AMBIGUITY",
    ])
  ) {
    return "ACCOUNT_OWNERSHIP_AMBIGUITY";
  }

  if (
    hasAny(text, [
      "PAYMENT HISTORY CONFLICT",
      "PAYMENT HISTORY",
      "PAYMENT STATUS",
      "PAYMENT RECORD",
      "LATE PAYMENT",
      "DELINQUENT PAYMENT",
    ])
  ) {
    return "INCONSISTENT_PAYMENT_REPORTING";
  }

  if (
    hasAny(text, [
      "DATE OBSOLESCENCE",
      "OBSOLETE",
      "STALE",
      "REPORTING PERIOD",
      "STATUTE",
      "LIMITATION",
      "REAGING",
      "RE AGING",
      "LAST ACTIVITY",
    ])
  ) {
    return "OBSOLETE_REPORTING";
  }

  if (
    hasAny(issueText, [
      "BALANCE CALCULATION",
      "BALANCE REPORTING",
      "CURRENT BALANCE",
      "AMOUNT OWING",
      "AMOUNT DUE",
      "CREDIT LIMIT",
    ])
  ) {
    return "INCONSISTENT_BALANCE_REPORTING";
  }

  if (
    hasAny(issueText, [
      "ACCOUNT STATUS",
      "STATUS CODE",
      "MOP",
      "RESOLVED",
      "SETTLED",
    ])
  ) {
    return "INCONSISTENT_STATUS_REPORTING";
  }

  if (
    hasAny(text, [
      "REPORTING CHRONOLOGY",
      "TEMPORAL",
      "DATE LOGIC",
      "REAGING",
      "RE AGING",
      "RETROACTIVE HISTORY",
    ])
  ) {
    return "REPORTING_CHRONOLOGY_CONFLICT";
  }

  if (
    hasAny(field, ["DATE", "ACTIVITY", "LAST REPORTED", "OPENED", "CLOSED", "DELINQUENCY"]) ||
    hasAny(text, ["DATE REPORTING", "DATE ACCURACY"])
  ) {
    return "DATE_ACCURACY_REVIEW";
  }

  if (
    (
      hasAny(field, ["BALANCE", "AMOUNT OWING", "AMOUNT DUE", "CURRENT BALANCE", "CREDIT LIMIT"]) ||
      hasAny(text, ["BALANCE CALCULATION", "BALANCE REPORTING", "CURRENT BALANCE", "AMOUNT OWING", "AMOUNT DUE", "CREDIT LIMIT"])
    ) &&
    !hasAny(field, ["DATE", "ACTIVITY", "LAST REPORTED"])
  ) {
    return "INCONSISTENT_BALANCE_REPORTING";
  }

  if (
    hasAny(field, ["STATUS", "MOP"]) ||
    hasAny(text, ["ACCOUNT STATUS", "STATUS CODE", "OPEN", "CLOSED", "MOP", "RESOLVED", "SETTLED"])
  ) {
    return "INCONSISTENT_STATUS_REPORTING";
  }

  if (hasAny(text, ["DUPLICATE", "CONFLICTING ACCOUNT", "CONFLICT", "MULTIPLE ACCOUNT"])) {
    return "DUPLICATE_REPORTING";
  }

  if (hasAny(text, ["IDENTITY", "ALIAS", "MIXED FILE", "PERSONAL INFORMATION", "NOT MY ACCOUNT"])) {
    return "IDENTITY_OR_OWNERSHIP_MISMATCH";
  }

  if (hasAny(text, ["OWNERSHIP", "ACCOUNT OWNERSHIP"])) {
    return "ACCOUNT_OWNERSHIP_AMBIGUITY";
  }

  if (hasAny(text, ["UNSUPPORTED", "UNVERIFIABLE", "DOCUMENTATION", "CHAIN", "NO DOCUMENTATION", "MISSING INFORMATION"])) {
    return "UNSUPPORTED_REPORTING";
  }

  if (input.accountNumberMissing || hasAny(text, ["MISSING ACCOUNT IDENTIFIER"])) {
    return "MISSING_ACCOUNT_IDENTIFIER";
  }

  return "GENERAL_ACCURACY_REVIEW";
}
