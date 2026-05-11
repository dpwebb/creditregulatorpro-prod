import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessRuleError } from "../../helpers/endpointErrorHandler";
import {
  assertPacketReadiness,
  evaluatePacketReadinessForIssues,
  resolvePacketCreditorObligationTestId,
  type PacketReadinessIssueInput,
} from "../../helpers/disputePacketService";

const user = { id: 1, role: "user" as const };
const admin = { id: 99, role: "admin" as const };

function issue(overrides: Partial<PacketReadinessIssueInput> = {}): PacketReadinessIssueInput {
  return {
    issueId: 10,
    userId: 1,
    tradelineId: 20,
    bureauId: 30,
    userStatus: "active",
    validationStatus: "PENDING",
    technicalDetails: {
      extractionConfidenceGate: {
        status: "confirmed",
        packetReady: true,
        confidenceScore: 95,
        requiresManualReview: false,
        reasonCodes: [],
      },
    },
    evidenceReference: "Source report #7; field: balance; page 2",
    packetTypes: ["credit_bureau"],
    ...overrides,
  };
}

describe("packet readiness evaluation", () => {
  it("returns packet-ready state for owned findings with linked evidence", () => {
    const readiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [issue()],
    );

    expect(readiness).toMatchObject({
      packetReady: true,
      blockers: [],
      eligibleFindingIds: [10],
      ineligibleFindingIds: [],
      reasonCodes: [],
    });
  });

  it("blocks parser-uncertain findings and unverified user-review findings", () => {
    const readiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10, 11] },
      [
        issue({
          issueId: 10,
          validationStatus: "PARSER_UNCERTAIN",
          technicalDetails: {
            extractionConfidenceGate: { status: "parser_uncertain", packetReady: false },
          },
        }),
        issue({
          issueId: 11,
          validationStatus: "NEEDS_USER_REVIEW",
          technicalDetails: {
            extractionConfidenceGate: { status: "needs_user_review", packetReady: false },
          },
        }),
      ],
    );

    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toContain("PARSER_UNCERTAIN");
    expect(readiness.reasonCodes).toContain("NEEDS_USER_REVIEW");
    expect(readiness.ineligibleFindingIds).toEqual([10, 11]);
  });

  it("allows a verified user-review finding when evidence is linked", () => {
    const readiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [
        issue({
          validationStatus: "NEEDS_USER_REVIEW",
          userStatus: "verified",
          technicalDetails: {
            extractionConfidenceGate: { status: "needs_user_review", packetReady: false },
          },
        }),
      ],
    );

    expect(readiness.packetReady).toBe(true);
    expect(readiness.eligibleFindingIds).toEqual([10]);
  });

  it("blocks findings when the stored extraction confidence gate is not packet-ready", () => {
    const readiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [
        issue({
          technicalDetails: {
            extractionConfidenceGate: { status: "unknown", packetReady: false },
          },
        }),
      ],
    );

    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toContain("EXTRACTION_CONFIDENCE_NOT_READY");
  });

  it("blocks dismissed findings and findings without required evidence", () => {
    const readiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10, 11] },
      [
        issue({ issueId: 10, userStatus: "dismissed" }),
        issue({ issueId: 11, evidenceReference: "Needs manual review" }),
      ],
    );

    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toContain("DISMISSED_FINDING");
    expect(readiness.reasonCodes).toContain("MISSING_REQUIRED_EVIDENCE");
    expect(readiness.reasonCodes).toContain("MANUAL_REVIEW_REQUIRED");
  });

  it("rejects unsafe multi-issue selections across tradelines", () => {
    const readiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10, 11] },
      [issue({ issueId: 10, tradelineId: 20 }), issue({ issueId: 11, tradelineId: 21 })],
    );

    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toContain("MIXED_TRADELINE_SELECTION");
    expect(() => assertPacketReadiness(readiness)).toThrow(BusinessRuleError);
  });

  it("keeps non-owner findings ineligible for users but allows admins past ownership", () => {
    const userReadiness = evaluatePacketReadinessForIssues(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [issue({ userId: 2 })],
    );
    expect(userReadiness.packetReady).toBe(false);
    expect(userReadiness.reasonCodes).toContain("UNAUTHORIZED_FINDING");
    expect(() => assertPacketReadiness(userReadiness)).toThrow(BusinessRuleError);

    const adminReadiness = evaluatePacketReadinessForIssues(
      admin,
      { packetType: "credit_bureau", selectedIssueIds: [10] },
      [issue({ userId: 2 })],
    );
    expect(adminReadiness.packetReady).toBe(true);
  });

  it("links single-issue packets and leaves multi-issue packets linked through metadata only", () => {
    expect(resolvePacketCreditorObligationTestId([10])).toBe(10);
    expect(resolvePacketCreditorObligationTestId([10, 11])).toBeNull();
  });
});

describe("packet readiness endpoint", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../helpers/getServerUserSession");
    vi.doUnmock("../../helpers/disputePacketService");
  });

  it("returns readiness state instead of the reset stub", async () => {
    vi.resetModules();
    const readiness = {
      packetReady: true,
      blockers: [],
      warnings: [],
      eligibleFindingIds: [10],
      ineligibleFindingIds: [],
      reasonCodes: [],
    };
    const validateDisputePacketReadiness = vi.fn(async () => readiness);

    vi.doMock("../../helpers/getServerUserSession", () => ({
      getServerUserSession: vi.fn(async () => ({ user })),
    }));
    vi.doMock("../../helpers/disputePacketService", () => ({
      validateDisputePacketReadiness,
    }));

    const { handle } = await import("../../endpoints/packet/validate-readiness_POST");
    const response = await handle(
      new Request("http://localhost/_api/packet/validate-readiness", {
        method: "POST",
        body: JSON.stringify({ packetType: "credit_bureau", selectedIssueIds: [10] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(readiness);
    expect(validateDisputePacketReadiness).toHaveBeenCalledWith(
      user,
      { packetType: "credit_bureau", selectedIssueIds: [10] },
    );
  });
});

describe("packet build/create endpoints", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../helpers/getServerUserSession");
    vi.doUnmock("../../helpers/disputePacketService");
  });

  it("returns a readiness error when build preview is blocked", async () => {
    vi.resetModules();
    const { BusinessRuleError: EndpointBusinessRuleError } = await import("../../helpers/endpointErrorHandler");
    const buildDisputePacketPreview = vi.fn(async () => {
      throw new EndpointBusinessRuleError("This finding must be verified before packet creation.");
    });

    vi.doMock("../../helpers/getServerUserSession", () => ({
      getServerUserSession: vi.fn(async () => ({ user })),
    }));
    vi.doMock("../../helpers/disputePacketService", () => ({
      buildDisputePacketPreview,
    }));

    const { handle } = await import("../../endpoints/packet/build_POST");
    const response = await handle(
      new Request("http://localhost/_api/packet/build", {
        method: "POST",
        body: JSON.stringify({ packetType: "credit_bureau", selectedIssueIds: [10] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This finding must be verified before packet creation.",
    });
  });

  it("returns a readiness error when create is blocked", async () => {
    vi.resetModules();
    const { BusinessRuleError: EndpointBusinessRuleError } = await import("../../helpers/endpointErrorHandler");
    const createDisputePacketRecord = vi.fn(async () => {
      throw new EndpointBusinessRuleError("Required source-report evidence is missing for this finding.");
    });

    vi.doMock("../../helpers/getServerUserSession", () => ({
      getServerUserSession: vi.fn(async () => ({ user })),
    }));
    vi.doMock("../../helpers/disputePacketService", () => ({
      createDisputePacketRecord,
    }));

    const { handle } = await import("../../endpoints/packet/create_POST");
    const response = await handle(
      new Request("http://localhost/_api/packet/create", {
        method: "POST",
        body: JSON.stringify({ packetType: "credit_bureau", selectedIssueIds: [10] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Required source-report evidence is missing for this finding.",
    });
  });

  it("returns a readiness error when save is blocked", async () => {
    vi.resetModules();
    const { BusinessRuleError: EndpointBusinessRuleError } = await import("../../helpers/endpointErrorHandler");
    const createDisputePacketRecord = vi.fn(async () => {
      throw new EndpointBusinessRuleError("Dismissed findings cannot be used to create packets.");
    });

    vi.doMock("../../helpers/getServerUserSession", () => ({
      getServerUserSession: vi.fn(async () => ({ user })),
    }));
    vi.doMock("../../helpers/disputePacketService", () => ({
      createDisputePacketRecord,
    }));

    const { handle } = await import("../../endpoints/packet/save_POST");
    const response = await handle(
      new Request("http://localhost/_api/packet/save", {
        method: "POST",
        body: JSON.stringify({ packetType: "credit_bureau", selectedIssueIds: [10] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Dismissed findings cannot be used to create packets.",
    });
  });
});
