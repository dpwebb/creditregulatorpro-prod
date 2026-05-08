import { describe, expect, it } from "vitest";

import {
  buildPacketRecommendationActionPlan,
  evaluatePacketReadiness,
} from "../../helpers/packetReadiness";

describe("packet readiness action plan", () => {
  it("marks a recommendation ready when consumer profile and bureau contact are complete", () => {
    const readiness = evaluatePacketReadiness({
      userAccount: {
        fullName: "Dana Webb",
        addressLine1: "1 Main Street",
        city: "Halifax",
        province: "NS",
        postalCode: "B3J 1A1",
      },
      bureau: {
        name: "TransUnion",
        address: "123 Bureau Way",
      },
    });

    expect(readiness).toEqual({
      isReady: true,
      missingUserFields: [],
      missingBureauInfo: false,
      bureauName: "TransUnion",
    });
    expect(buildPacketRecommendationActionPlan(readiness)).toEqual({
      deterministic: true,
      ruleId: "packet-action-readiness-v1",
      primaryAction: "CREATE_PACKET",
      status: "ready",
      ctaLabel: "Challenge This Account",
      blockers: [],
    });
  });

  it("blocks packet creation on missing user profile fields first", () => {
    const actionPlan = buildPacketRecommendationActionPlan(
      evaluatePacketReadiness({
        userAccount: {
          fullName: "",
          addressLine1: "1 Main Street",
          city: "Halifax",
          province: "NS",
          postalCode: "not-postal",
        },
        bureau: {
          name: "Equifax",
          address: null,
          addressLine1: "2 Bureau Road",
          city: "Toronto",
          province: "ON",
          postalCode: "M5V 2T6",
        },
      }),
    );

    expect(actionPlan.primaryAction).toBe("COMPLETE_PROFILE");
    expect(actionPlan.status).toBe("blocked");
    expect(actionPlan.blockers).toEqual([
      {
        code: "missing_user_profile",
        label: "Complete your profile before creating the letter.",
        fields: ["fullName", "postalCode"],
      },
    ]);
  });

  it("blocks packet creation when bureau mailing contact is unavailable", () => {
    const actionPlan = buildPacketRecommendationActionPlan(
      evaluatePacketReadiness({
        userAccount: {
          fullName: "Dana Webb",
          addressLine1: "1 Main Street",
          city: "Halifax",
          province: "NS",
          postalCode: "B3J 1A1",
        },
        bureau: {
          name: "Equifax",
          address: null,
          addressLine1: null,
          city: "Toronto",
          province: "ON",
          postalCode: "M5V 2T6",
        },
      }),
    );

    expect(actionPlan.primaryAction).toBe("UPDATE_BUREAU_CONTACT");
    expect(actionPlan.status).toBe("blocked");
    expect(actionPlan.blockers).toEqual([
      {
        code: "missing_bureau_contact",
        label: "Equifax needs a mailing address before a letter can be generated.",
        fields: ["bureauAddress"],
      },
    ]);
  });

  it("blocks recommendation actions when parser confidence needs source review", () => {
    const actionPlan = buildPacketRecommendationActionPlan(
      evaluatePacketReadiness({
        userAccount: {
          fullName: "Dana Webb",
          addressLine1: "1 Main Street",
          city: "Halifax",
          province: "NS",
          postalCode: "B3J 1A1",
        },
        bureau: {
          name: "TransUnion",
          address: "123 Bureau Way",
        },
      }),
      {
        deterministic: true,
        ruleId: "violation-packet-confidence-gate-v1",
        status: "parser_uncertain",
        packetReady: false,
        blockerCode: "parser_uncertain",
        confidenceScore: 42,
        message:
          "The source report extraction needs parser review before a dispute packet can be generated.",
      },
    );

    expect(actionPlan).toEqual({
      deterministic: true,
      ruleId: "packet-action-readiness-v1",
      primaryAction: "REVIEW_SOURCE_REPORT",
      status: "blocked",
      ctaLabel: "Review Source Report",
      blockers: [
        {
          code: "parser_uncertain",
          label:
            "The source report extraction needs parser review before a dispute packet can be generated.",
          fields: ["sourceReport"],
        },
      ],
    });
  });
});
