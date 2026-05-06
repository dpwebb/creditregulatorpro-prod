import { describe, expect, it } from "vitest";

import { buildPacketLifecycleSummary } from "../../helpers/packetLifecycle";

describe("packet lifecycle summary", () => {
  it("marks failed generation as retryable", () => {
    expect(buildPacketLifecycleSummary({ processingStatus: "failed" })).toEqual({
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "GENERATION_FAILED",
      nextAction: "RETRY_GENERATION",
      label: "Generation failed",
      detail: "The letter did not finish generating.",
      responseDueDate: null,
    });
  });

  it("computes a stable response due date from sent date and response clock", () => {
    expect(
      buildPacketLifecycleSummary({
        status: "Sent",
        sentDate: "2026-05-01T12:00:00.000Z",
        responseClockDays: 30,
      }),
    ).toEqual({
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "AWAITING_RESPONSE",
      nextAction: "LOG_RESPONSE",
      label: "Awaiting response",
      detail: "Response clock date: 2026-05-31",
      responseDueDate: "2026-05-31",
    });
  });

  it("moves response and outcome records ahead of sent-state tracking", () => {
    expect(
      buildPacketLifecycleSummary({
        sentDate: "2026-05-01T12:00:00.000Z",
        bureauResponseDate: "2026-05-10T12:00:00.000Z",
        responseType: "verified",
        responseClockDays: 30,
      }).stage,
    ).toBe("RESPONSE_RECORDED");

    expect(
      buildPacketLifecycleSummary({
        sentDate: "2026-05-01T12:00:00.000Z",
        bureauResponseDate: "2026-05-10T12:00:00.000Z",
        responseType: "verified",
        successOutcome: "Deleted",
        responseClockDays: 30,
      }).stage,
    ).toBe("OUTCOME_RECORDED");
  });

  it("keeps draft and ready-to-send states separate", () => {
    expect(buildPacketLifecycleSummary({ status: "Draft" }).nextAction).toBe("REVIEW_LETTER");
    expect(buildPacketLifecycleSummary({ status: "Ready to Mail" }).nextAction).toBe("RECORD_MAILING");
  });
});
