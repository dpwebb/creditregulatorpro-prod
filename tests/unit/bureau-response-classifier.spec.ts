import { describe, expect, it } from "vitest";

import { classifyBureauResponse } from "../../helpers/bureauResponseClassifier";

describe("bureau response classifier", () => {
  it("keeps acknowledgments out of substantive response handling", () => {
    expect(
      classifyBureauResponse({
        communicationType: "BUREAU_ACKNOWLEDGMENT",
        description: "We acknowledge receipt of your dispute.",
      }),
    ).toMatchObject({
      deterministic: true,
      ruleId: "bureau-response-classifier-v1",
      responseType: "acknowledgment",
      responseStatus: "ACKNOWLEDGMENT_RECEIVED",
      obligationState: "CHALLENGED",
      responseReceived: false,
      followUpRecommendation: "WAIT_FOR_SUBSTANTIVE_RESPONSE",
    });
  });

  it("classifies deletion notices as worked outcomes with no follow-up", () => {
    expect(
      classifyBureauResponse({
        communicationType: "BUREAU_RESPONSE_RECEIVED",
        responseLetterContent: "The disputed collection account has been deleted from your file.",
        responseReceivedDate: "2026-05-10T12:00:00.000Z",
        responseDeadline: "2026-05-31T12:00:00.000Z",
      }),
    ).toMatchObject({
      responseType: "deleted",
      responseStatus: "DELETED",
      obligationState: "ADDRESSED_VIA_LINKED_DISPUTE",
      responseReceived: true,
      receivedOnTime: true,
      timingDriftDays: -21,
      followUpRecommendation: "NO_FOLLOW_UP_REQUIRED",
      successOutcome: "WORKED",
    });
  });

  it("classifies verified no-change responses without MOV as deficient", () => {
    expect(
      classifyBureauResponse({
        communicationType: "BUREAU_RESPONSE_RECEIVED",
        responseLetterContent: "We verified the account as accurate as reported. No change will be made.",
        responseMovDisclosed: false,
      }),
    ).toMatchObject({
      responseType: "no_method_of_verification",
      responseStatus: "NO_METHOD_OF_VERIFICATION",
      obligationState: "INSUFFICIENT_RESPONSE",
      deficiencyCodes: ["MOV_MISSING"],
      followUpRecommendation: "REQUEST_METHOD_OF_VERIFICATION",
    });
  });

  it("detects partial item coverage deterministically", () => {
    expect(
      classifyBureauResponse({
        communicationType: "BUREAU_CORRECTION_NOTICE",
        responseLetterContent: "We updated the balance.",
        responseItemsDisputed: ["balance", "date of first delinquency"],
        responseItemsAddressed: ["balance"],
      }),
    ).toMatchObject({
      responseType: "partial_response",
      responseStatus: "PARTIAL_RESPONSE",
      obligationState: "INSUFFICIENT_RESPONSE",
      deficiencyCodes: ["PARTIAL_ITEM_COVERAGE"],
      followUpRecommendation: "SEND_TARGETED_CORRECTION_FOLLOW_UP",
      successOutcome: null,
    });
  });

  it("preserves no-response status and timing drift", () => {
    expect(
      classifyBureauResponse({
        responseStatus: "No response",
        responseReceivedDate: "2026-06-05T12:00:00.000Z",
        responseDeadline: "2026-05-31T12:00:00.000Z",
      }),
    ).toMatchObject({
      responseType: "no_response",
      responseStatus: "NO_RESPONSE",
      obligationState: "NO_RESPONSE",
      responseReceived: false,
      receivedOnTime: false,
      timingDriftDays: 5,
      deficiencyCodes: ["NO_RESPONSE_RECORDED"],
      followUpRecommendation: "SEND_NO_RESPONSE_FOLLOW_UP",
    });
  });
});
