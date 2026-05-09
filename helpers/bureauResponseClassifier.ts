import type { ObligationState } from "./schema";

export const BUREAU_RESPONSE_CLASSIFIER_RULE_ID = "bureau-response-classifier-v1" as const;

export type NormalizedBureauResponseType =
  | "acknowledgment"
  | "verification_request"
  | "deleted"
  | "corrected"
  | "partial_response"
  | "verified_no_change"
  | "no_method_of_verification"
  | "insufficient_documentation"
  | "denied"
  | "unrelated_response"
  | "no_response"
  | "other_response";

export type BureauResponseFollowUpRecommendation =
  | "WAIT_FOR_SUBSTANTIVE_RESPONSE"
  | "REQUEST_METHOD_OF_VERIFICATION"
  | "SEND_NO_RESPONSE_FOLLOW_UP"
  | "SEND_TARGETED_CORRECTION_FOLLOW_UP"
  | "ESCALATE_OR_COMPLAINT"
  | "NO_FOLLOW_UP_REQUIRED"
  | "MANUAL_REVIEW";

export interface BureauResponseClassification {
  deterministic: true;
  ruleId: typeof BUREAU_RESPONSE_CLASSIFIER_RULE_ID;
  responseType: NormalizedBureauResponseType;
  responseStatus: string;
  obligationState: ObligationState;
  responseReceived: boolean;
  receivedOnTime: boolean | null;
  timingDriftDays: number | null;
  deficiencyCodes: string[];
  followUpRecommendation: BureauResponseFollowUpRecommendation;
  summary: string;
  successOutcome: "WORKED" | null;
}

export interface ClassifyBureauResponseInput {
  communicationType?: string | null;
  responseStatus?: string | null;
  responseLetterContent?: string | null;
  description?: string | null;
  responseMovDisclosed?: boolean | null;
  responseMovDescription?: string | null;
  responseDocumentationProvided?: boolean | null;
  responseDocumentationTypes?: unknown;
  responseItemsDisputed?: unknown;
  responseItemsAddressed?: unknown;
  responseReceivedDate?: Date | string | null;
  responseDeadline?: Date | string | null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timing(received: Date | string | null | undefined, deadline: Date | string | null | undefined) {
  const responseDate = toDate(received);
  const deadlineDate = toDate(deadline);
  if (!responseDate || !deadlineDate) {
    return { receivedOnTime: null, timingDriftDays: null };
  }

  const drift = Math.round((responseDate.getTime() - deadlineDate.getTime()) / 86_400_000);
  return { receivedOnTime: drift <= 0, timingDriftDays: drift };
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasFullAddressedCoverage(disputed: string[], addressed: string[]): boolean {
  if (disputed.length === 0) return true;
  if (addressed.length === 0) return false;

  const addressedSet = new Set(addressed.map(normalizeText));
  return disputed.every((item) => addressedSet.has(normalizeText(item)));
}

function result(params: {
  responseType: NormalizedBureauResponseType;
  responseStatus: string;
  obligationState: ObligationState;
  responseReceived: boolean;
  deficiencyCodes?: string[];
  followUpRecommendation: BureauResponseFollowUpRecommendation;
  summary: string;
  successOutcome?: "WORKED" | null;
  receivedOnTime: boolean | null;
  timingDriftDays: number | null;
}): BureauResponseClassification {
  return {
    deterministic: true,
    ruleId: BUREAU_RESPONSE_CLASSIFIER_RULE_ID,
    deficiencyCodes: [],
    successOutcome: null,
    ...params,
  };
}

export function classifyBureauResponse(input: ClassifyBureauResponseInput): BureauResponseClassification {
  const disputedItems = asStringArray(input.responseItemsDisputed);
  const addressedItems = asStringArray(input.responseItemsAddressed);
  const documentTypes = asStringArray(input.responseDocumentationTypes);
  const communicationType = normalizeText(input.communicationType);
  const text = normalizeText([
    input.communicationType,
    input.responseStatus,
    input.responseLetterContent,
    input.description,
    input.responseMovDescription,
    disputedItems.join(" "),
    addressedItems.join(" "),
    documentTypes.join(" "),
  ].filter(Boolean).join(" "));
  const { receivedOnTime, timingDriftDays } = timing(input.responseReceivedDate, input.responseDeadline);
  const partialCoverage = disputedItems.length > 0 && !hasFullAddressedCoverage(disputedItems, addressedItems);

  if (
    includesAny(text, [
      /\bno response\b/,
      /\bno reply\b/,
      /\bno answer\b/,
      /\bignored\b/,
      /\bnever responded\b/,
      /\bnot responded\b/,
    ])
  ) {
    return result({
      responseType: "no_response",
      responseStatus: "NO_RESPONSE",
      obligationState: "NO_RESPONSE",
      responseReceived: false,
      deficiencyCodes: ["NO_RESPONSE_RECORDED"],
      followUpRecommendation: "SEND_NO_RESPONSE_FOLLOW_UP",
      summary: "No substantive bureau response has been recorded.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (communicationType === "bureau acknowledgment" || includesAny(text, [/\backnowledg(e|ed|ement|ment)\b/, /\breceived your dispute\b/])) {
    return result({
      responseType: "acknowledgment",
      responseStatus: "ACKNOWLEDGMENT_RECEIVED",
      obligationState: "CHALLENGED",
      responseReceived: false,
      followUpRecommendation: "WAIT_FOR_SUBSTANTIVE_RESPONSE",
      summary: "The bureau acknowledged receipt but did not provide a substantive decision.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    communicationType === "bureau verification request" ||
    includesAny(text, [/\brequest(s|ed)? additional\b/, /\badditional information\b/, /\bidentity verification\b/, /\bverify your identity\b/])
  ) {
    return result({
      responseType: "verification_request",
      responseStatus: "VERIFICATION_REQUESTED",
      obligationState: "CHALLENGED",
      responseReceived: false,
      followUpRecommendation: "WAIT_FOR_SUBSTANTIVE_RESPONSE",
      summary: "The bureau requested verification or more information before a substantive decision.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    includesAny(text, [
      /\bdelete(d)?\b/,
      /\bdeletion\b/,
      /\bremoved?\b/,
      /\bwill be removed\b/,
      /\bhas been removed\b/,
    ])
  ) {
    return result({
      responseType: partialCoverage ? "partial_response" : "deleted",
      responseStatus: partialCoverage ? "PARTIAL_RESPONSE" : "DELETED",
      obligationState: partialCoverage ? "INSUFFICIENT_RESPONSE" : "ADDRESSED_VIA_LINKED_DISPUTE",
      responseReceived: true,
      deficiencyCodes: partialCoverage ? ["PARTIAL_ITEM_COVERAGE"] : [],
      followUpRecommendation: partialCoverage ? "SEND_TARGETED_CORRECTION_FOLLOW_UP" : "NO_FOLLOW_UP_REQUIRED",
      summary: partialCoverage
        ? "The bureau reported a deletion but did not address every disputed item."
        : "The bureau reported that the disputed item was deleted or removed.",
      successOutcome: partialCoverage ? null : "WORKED",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    communicationType === "bureau correction notice" ||
    includesAny(text, [/\bcorrect(ed|ion)?\b/, /\bupdated?\b/, /\bmodified?\b/, /\bamended?\b/])
  ) {
    return result({
      responseType: partialCoverage ? "partial_response" : "corrected",
      responseStatus: partialCoverage ? "PARTIAL_RESPONSE" : "CORRECTED",
      obligationState: partialCoverage ? "INSUFFICIENT_RESPONSE" : "ADDRESSED_VIA_LINKED_DISPUTE",
      responseReceived: true,
      deficiencyCodes: partialCoverage ? ["PARTIAL_ITEM_COVERAGE"] : [],
      followUpRecommendation: partialCoverage ? "SEND_TARGETED_CORRECTION_FOLLOW_UP" : "NO_FOLLOW_UP_REQUIRED",
      summary: partialCoverage
        ? "The bureau reported a correction but did not address every disputed item."
        : "The bureau reported a correction or update.",
      successOutcome: partialCoverage ? null : "WORKED",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    input.responseDocumentationProvided === false ||
    includesAny(text, [/\binsufficient documentation\b/, /\bno documentation\b/, /\bdocumentation not provided\b/, /\bwithout supporting documents\b/])
  ) {
    return result({
      responseType: "insufficient_documentation",
      responseStatus: "INSUFFICIENT_DOCUMENTATION",
      obligationState: "INSUFFICIENT_RESPONSE",
      responseReceived: true,
      deficiencyCodes: ["DOCUMENTATION_MISSING"],
      followUpRecommendation: "REQUEST_METHOD_OF_VERIFICATION",
      summary: "The bureau response is missing supporting documentation.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    includesAny(text, [/\bverified\b/, /\bverified as accurate\b/, /\baccurate as reported\b/, /\bconfirmed\b/, /\bno change\b/, /\bremains\b/])
  ) {
    if (input.responseMovDisclosed !== true && !normalizeText(input.responseMovDescription)) {
      return result({
        responseType: "no_method_of_verification",
        responseStatus: "NO_METHOD_OF_VERIFICATION",
        obligationState: "INSUFFICIENT_RESPONSE",
        responseReceived: true,
        deficiencyCodes: ["MOV_MISSING"],
        followUpRecommendation: "REQUEST_METHOD_OF_VERIFICATION",
        summary: "The bureau verified the item without disclosing the method of verification.",
        receivedOnTime,
        timingDriftDays,
      });
    }

    return result({
      responseType: partialCoverage ? "partial_response" : "verified_no_change",
      responseStatus: partialCoverage ? "PARTIAL_RESPONSE" : "VERIFIED_NO_CHANGE",
      obligationState: "INSUFFICIENT_RESPONSE",
      responseReceived: true,
      deficiencyCodes: partialCoverage ? ["PARTIAL_ITEM_COVERAGE"] : [],
      followUpRecommendation: partialCoverage ? "SEND_TARGETED_CORRECTION_FOLLOW_UP" : "MANUAL_REVIEW",
      summary: partialCoverage
        ? "The bureau verified the item but did not address every disputed item."
        : "The bureau verified the item with no reported change.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    communicationType === "bureau denial" ||
    includesAny(text, [/\bdenied\b/, /\brejected\b/, /\brefused\b/, /\bwill not investigate\b/, /\bfrivolous\b/])
  ) {
    return result({
      responseType: "denied",
      responseStatus: "DENIED",
      obligationState: "INSUFFICIENT_RESPONSE",
      responseReceived: true,
      deficiencyCodes: ["DENIAL_RESPONSE"],
      followUpRecommendation: "ESCALATE_OR_COMPLAINT",
      summary: "The bureau denied or rejected the dispute.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  if (
    includesAny(text, [
      /\bunable to locate\b/,
      /\bdoes not match\b/,
      /\bnot enough information\b/,
      /\bunrelated\b/,
      /\bwrong account\b/,
    ])
  ) {
    return result({
      responseType: "unrelated_response",
      responseStatus: "UNRELATED_RESPONSE",
      obligationState: "INSUFFICIENT_RESPONSE",
      responseReceived: true,
      deficiencyCodes: ["UNRELATED_OR_UNMATCHED_RESPONSE"],
      followUpRecommendation: "MANUAL_REVIEW",
      summary: "The bureau response appears unrelated or unable to match the disputed item.",
      receivedOnTime,
      timingDriftDays,
    });
  }

  return result({
    responseType: "other_response",
    responseStatus: input.responseStatus ? normalizeText(input.responseStatus).toUpperCase().replace(/\s+/g, "_") : "OTHER_RESPONSE",
    obligationState: "INSUFFICIENT_RESPONSE",
    responseReceived: true,
    followUpRecommendation: "MANUAL_REVIEW",
    summary: "A substantive bureau response was recorded but needs review.",
    receivedOnTime,
    timingDriftDays,
  });
}
