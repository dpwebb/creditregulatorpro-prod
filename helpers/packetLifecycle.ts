export type PacketLifecycleStage =
  | "GENERATION_FAILED"
  | "DRAFT"
  | "READY_TO_SEND"
  | "AWAITING_RESPONSE"
  | "RESPONSE_RECORDED"
  | "OUTCOME_RECORDED";

export type PacketLifecycleNextAction =
  | "RETRY_GENERATION"
  | "REVIEW_LETTER"
  | "RECORD_MAILING"
  | "LOG_RESPONSE"
  | "REVIEW_RESPONSE"
  | "TRACK_OUTCOME_COMPLETE";

export interface PacketLifecycleInput {
  status?: string | null;
  processingStatus?: string | null;
  sentDate?: string | Date | null;
  bureauResponseDate?: string | Date | null;
  responseType?: string | null;
  successOutcome?: string | null;
  trackingNumber?: string | null;
  deliveryMethod?: string | null;
  responseClockDays?: number | null;
}

export interface PacketLifecycleSummary {
  deterministic: true;
  ruleId: "packet-lifecycle-v1";
  stage: PacketLifecycleStage;
  nextAction: PacketLifecycleNextAction;
  label: string;
  detail: string;
  responseDueDate: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): string {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function responseDueDate(input: PacketLifecycleInput): string | null {
  const sentDate = toDate(input.sentDate);
  const days = input.responseClockDays;
  if (!sentDate || days == null || days <= 0) return null;
  return addDays(sentDate, days);
}

export function buildPacketLifecycleSummary(input: PacketLifecycleInput): PacketLifecycleSummary {
  const status = normalizeText(input.status);
  const processingStatus = normalizeText(input.processingStatus);
  const hasResponse =
    Boolean(input.bureauResponseDate) ||
    Boolean(input.responseType?.trim());
  const hasOutcome = Boolean(input.successOutcome?.trim());
  const dueDate = responseDueDate(input);

  if (processingStatus === "failed") {
    return {
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "GENERATION_FAILED",
      nextAction: "RETRY_GENERATION",
      label: "Generation failed",
      detail: "The letter did not finish generating.",
      responseDueDate: null,
    };
  }

  if (hasOutcome) {
    return {
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "OUTCOME_RECORDED",
      nextAction: "TRACK_OUTCOME_COMPLETE",
      label: "Outcome recorded",
      detail: input.successOutcome?.trim() || "The outcome has been recorded.",
      responseDueDate: dueDate,
    };
  }

  if (hasResponse) {
    return {
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "RESPONSE_RECORDED",
      nextAction: "REVIEW_RESPONSE",
      label: "Response recorded",
      detail: input.responseType?.trim() || "A response has been recorded.",
      responseDueDate: dueDate,
    };
  }

  if (input.sentDate) {
    return {
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "AWAITING_RESPONSE",
      nextAction: "LOG_RESPONSE",
      label: "Awaiting response",
      detail: dueDate ? `Response clock date: ${dueDate}` : "Record the response when it arrives.",
      responseDueDate: dueDate,
    };
  }

  if (status === "draft") {
    return {
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "DRAFT",
      nextAction: "REVIEW_LETTER",
      label: "Review letter",
      detail: "Review the draft before marking it ready to mail.",
      responseDueDate: null,
    };
  }

  return {
    deterministic: true,
    ruleId: "packet-lifecycle-v1",
    stage: "READY_TO_SEND",
    nextAction: "RECORD_MAILING",
    label: "Ready to mail",
    detail:
      input.trackingNumber || input.deliveryMethod
        ? "Mailing details are partially recorded."
        : "Record mailing when the letter is sent.",
    responseDueDate: null,
  };
}
