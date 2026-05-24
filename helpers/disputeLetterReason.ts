import type { PacketNarrative, PacketRequestedAction } from "./disputePacketTemplate";
import { canonicalDisputeIntentFor, disputeIntentArchetypeFor } from "./disputeIntent";

export const PLAIN_DISPUTE_LETTER_REASONS = {
  EXCEEDED_REPORTING_PERIOD:
    "This account appears to remain on my credit file beyond the appropriate reporting period.",
  INCORRECT_BALANCE:
    "The balance being reported does not appear accurate based on my records.",
  DUPLICATE_ACCOUNT:
    "This account appears to be reported more than once, which may be inaccurately affecting my file.",
  NOT_MY_ACCOUNT:
    "I do not recognize this account and dispute responsibility for it.",
  RESOLVED_STATUS_INCORRECT:
    "This account has been resolved, but the reporting does not appear to reflect the current status accurately.",
  INCORRECT_LATE_PAYMENTS:
    "The payment history being reported does not appear to match my records.",
  MIXED_FILE_OR_IDENTITY:
    "This information may belong to another individual and appears to have been placed on my report in error.",
  COLLECTION_INCOMPLETE_OR_INACCURATE:
    "I am requesting review of this collection account because the information being reported appears incomplete or inaccurate.",
  MISSING_ACCOUNT_IDENTIFIER:
    "The account number is not shown on my report, so I am asking the bureau to verify the account before it continues to be reported.",
  FALLBACK:
    "I am disputing this item because the information being reported appears inaccurate or incomplete.",
} as const;

export type PlainDisputeLetterReasonKey = keyof typeof PLAIN_DISPUTE_LETTER_REASONS;

export interface PlainDisputeLetterReasonInput {
  issueType?: string | null;
  requestedAction?: PacketRequestedAction | string | null;
  disputedField?: string | null;
  narrative?: Pick<PacketNarrative, "disputeCategory"> | null;
}

function haystack(input: PlainDisputeLetterReasonInput): string {
  return [
    input.issueType,
    input.requestedAction,
    input.disputedField,
    input.narrative?.disputeCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ");
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function disputeLetterReasonKeyFor(input: PlainDisputeLetterReasonInput): PlainDisputeLetterReasonKey {
  const intent = canonicalDisputeIntentFor({
    issueType: input.issueType,
    disputedField: input.disputedField,
    disputeCategory: input.narrative?.disputeCategory,
  });
  if (intent === "OBSOLETE_REPORTING") return "EXCEEDED_REPORTING_PERIOD";
  if (intent === "INCONSISTENT_BALANCE_REPORTING") return "INCORRECT_BALANCE";
  if (intent === "DUPLICATE_REPORTING") return "DUPLICATE_ACCOUNT";
  if (intent === "MISSING_ACCOUNT_IDENTIFIER") return "MISSING_ACCOUNT_IDENTIFIER";
  if (intent === "IDENTITY_OR_OWNERSHIP_MISMATCH") return "MIXED_FILE_OR_IDENTITY";
  if (intent === "ACCOUNT_OWNERSHIP_AMBIGUITY") return "MIXED_FILE_OR_IDENTITY";
  if (intent === "INCONSISTENT_PAYMENT_REPORTING") return "INCORRECT_LATE_PAYMENTS";
  if (intent === "INCONSISTENT_STATUS_REPORTING") return "RESOLVED_STATUS_INCORRECT";
  if (intent === "INCOMPLETE_COLLECTION_REPORTING") return "COLLECTION_INCOMPLETE_OR_INACCURATE";
  if (intent === "UNVERIFIABLE_COLLECTION_IDENTITY") return "COLLECTION_INCOMPLETE_OR_INACCURATE";

  const value = haystack(input);
  const fieldValue = String(input.disputedField ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ");
  const issueActionFieldValue = [
    input.issueType,
    input.requestedAction,
    input.disputedField,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ");
  const fieldLooksDateRelated = hasAny(fieldValue, [
    "DATE",
    "LAST REPORTED",
    "ACTIVITY",
    "LAST PAYMENT",
    "OPENED",
    "CLOSED",
    "DELINQUENCY",
  ]);

  if (
    hasAny(value, [
      "POSSIBLE OBSOLETE OR STALE REPORTING",
      "OBSOLETE",
      "STALE",
      "REPORTING PERIOD",
      "STATUTE",
      "LIMITATION",
      "TEMPORAL",
      "REAGING",
      "RE AGING",
    ])
  ) {
    return "EXCEEDED_REPORTING_PERIOD";
  }

  if (hasAny(value, ["MISSING ACCOUNT IDENTIFIER"])) {
    return "MISSING_ACCOUNT_IDENTIFIER";
  }

  if (hasAny(value, ["DUPLICATE", "CONFLICTING ACCOUNT", "CONFLICT", "MULTIPLE ACCOUNT"])) {
    return "DUPLICATE_ACCOUNT";
  }

  if (hasAny(value, ["ACCOUNT NOT RECOGNIZED", "NOT MY ACCOUNT", "UNKNOWN ACCOUNT", "DO NOT RECOGNIZE"])) {
    return "NOT_MY_ACCOUNT";
  }

  if (hasAny(value, ["IDENTITY", "ALIAS", "MIXED FILE", "PERSONAL INFORMATION", "PERSONAL INFO"])) {
    return "MIXED_FILE_OR_IDENTITY";
  }

  if (hasAny(value, ["LATE PAYMENT", "LATE PAYMENTS", "PAYMENT HISTORY", "DELINQUENT PAYMENT", "PAYMENT RECORD"])) {
    return "INCORRECT_LATE_PAYMENTS";
  }

  if (
    hasAny(issueActionFieldValue, ["BALANCE", "AMOUNT OWING", "AMOUNT DUE", "CURRENT BALANCE"]) &&
    !fieldLooksDateRelated
  ) {
    return "INCORRECT_BALANCE";
  }

  if (
    hasAny(issueActionFieldValue, ["PAID", "RESOLVED", "SETTLED"]) ||
    (hasAny(issueActionFieldValue, ["CLOSED"]) && !fieldLooksDateRelated)
  ) {
    return "RESOLVED_STATUS_INCORRECT";
  }

  if (hasAny(value, ["COLLECTION", "COLLECTOR", "DEFAULT"])) {
    return "COLLECTION_INCOMPLETE_OR_INACCURATE";
  }

  return "FALLBACK";
}

export function plainDisputeLetterReasonFor(input: PlainDisputeLetterReasonInput): string {
  const intent = canonicalDisputeIntentFor({
    issueType: input.issueType,
    disputedField: input.disputedField,
    disputeCategory: input.narrative?.disputeCategory,
  });
  if (intent !== "GENERAL_ACCURACY_REVIEW") {
    return disputeIntentArchetypeFor(intent).consumerNarrative;
  }
  return PLAIN_DISPUTE_LETTER_REASONS[disputeLetterReasonKeyFor(input)];
}
