export const DISPUTE_PACKET_VERSION = "simple-dispute-packet-v1" as const;
export const DISPUTE_PACKET_CONSUMER_SUBJECT =
  "Request to investigate and correct credit report information";

export const DISPUTE_PACKET_TYPES = [
  "credit_bureau",
  "collection_agency",
] as const;

export type DisputePacketType = (typeof DISPUTE_PACKET_TYPES)[number];

export const ALLOWED_PACKET_REQUESTED_ACTIONS = [
  "correct inaccurate information",
  "remove unsupported information",
  "verify and provide basis",
  "update stale information",
  "correct duplicate account",
  "correct balance",
  "correct account status",
  "correct date",
  "correct personal information",
  "clarify collection authority/details",
] as const;

export type PacketRequestedAction = (typeof ALLOWED_PACKET_REQUESTED_ACTIONS)[number];

export const PACKET_NARRATIVE_DISPUTE_CATEGORIES = [
  "FIELD_ACCURACY",
  "UNSUPPORTED_REPORTING",
  "POSSIBLE_OBSOLETE_OR_STALE_REPORTING",
  "MISSING_ACCOUNT_IDENTIFIER",
  "ACCOUNT_NOT_RECOGNIZED",
  "IDENTITY_OR_ALIAS_MISMATCH",
  "COLLECTION_OR_DEFAULT_STATUS",
  "BALANCE_OR_STATUS_ACCURACY",
  "DUPLICATE_OR_CONFLICTING_ACCOUNT",
  "GENERAL_ACCURACY",
  "UNKNOWN",
] as const;

export type PacketNarrativeDisputeCategory = (typeof PACKET_NARRATIVE_DISPUTE_CATEGORIES)[number];

export const PACKET_NARRATIVE_CAUTION_LEVELS = [
  "NORMAL",
  "CAUTIOUS",
  "NEEDS_REVIEW",
] as const;

export type PacketNarrativeCautionLevel = (typeof PACKET_NARRATIVE_CAUTION_LEVELS)[number];

export interface PacketNarrative {
  disputeCategory: PacketNarrativeDisputeCategory;
  cautionLevel: PacketNarrativeCautionLevel;
  issueSummary: string;
  factualBasis: string[];
  consumerAssertion: string;
  verificationRequests: string[];
  requestedRemedies: string[];
  evidenceReferences: string[];
  readinessWarnings: string[];
  readinessBlockers: string[];
  internalReference?: string | null;
  externalReferenceDisplay?: string | null;
}
