import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseReplayArgs } from "../../scripts/response-processing-replay";

describe("response processing replay script", () => {
  it("defaults to dry-run and supports safe filters", () => {
    const parsed = parseReplayArgs([
      "--consumer-id",
      "42",
      "--packet-id",
      "7",
      "--source-type",
      "manual_admin",
      "--classification",
      "unknown_manual_review",
      "--manual-review-required",
      "true",
      "--start-date",
      "2026-05-01",
      "--end-date",
      "2026-05-20",
      "--limit",
      "25",
      "--json",
    ]);

    expect(parsed).toMatchObject({
      mode: "dry_run",
      confirmApply: false,
      actorUserId: null,
      json: true,
      filters: {
        userId: 42,
        packetId: 7,
        sourceType: "manual_admin",
        classification: "unknown_manual_review",
        manualReviewRequired: true,
        startDate: "2026-05-01",
        endDate: "2026-05-20",
        limit: 25,
      },
    });
  });

  it("requires explicit confirmation and actor for apply mode", () => {
    expect(() => parseReplayArgs(["--apply"])).toThrow(/confirm-apply/i);
    expect(() => parseReplayArgs(["--apply", "--confirm-apply"])).toThrow(/actor-user-id/i);
    expect(parseReplayArgs(["--apply", "--confirm-apply", "--actor-user-id", "9"]).mode).toBe("apply");
  });

  it("keeps replay tooling out of live mailbox and source-truth paths", () => {
    const source = [
      "helpers/responseReplayService.ts",
      "scripts/response-processing-replay.ts",
    ]
      .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/gmail|imap|outlook|mailbox polling|oauth refresh token|mailbox password/i);
    expect(source).not.toMatch(/full email body|email body dump/i);
    expect(source).not.toMatch(/updateTable\("packet"\)|updateTable\("reportArtifact"\)|updateTable\("tradeline"\)|updateTable\("creditorObligationTest"\)/);
    expect(source).toContain("noRawResponseTextStored");
    expect(source).toContain("canonicalFactsMutated: false");
    expect(source).toContain("packetReadinessMutated: false");
  });
});
