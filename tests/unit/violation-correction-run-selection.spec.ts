import { describe, expect, it } from "vitest";

import { selectCanonicalViolationReviewRuns } from "../../helpers/violationCorrectionRunSelection";

describe("violation correction run selection", () => {
  it("shows one review run per report artifact and prefers A_FULL", () => {
    const runs = selectCanonicalViolationReviewRuns([
      {
        id: 282,
        reportArtifactId: 269,
        pass: "A",
        status: "completed",
        completedAt: "2026-05-07T23:28:52.881Z",
        createdAt: "2026-05-07T23:28:57.553Z",
      },
      {
        id: 283,
        reportArtifactId: 269,
        pass: "A_FULL",
        status: "completed",
        completedAt: "2026-05-07T23:28:52.895Z",
        createdAt: "2026-05-07T23:28:57.569Z",
      },
      {
        id: 284,
        reportArtifactId: 270,
        pass: "A",
        status: "completed",
        completedAt: "2026-05-08T00:00:00.000Z",
        createdAt: "2026-05-08T00:00:01.000Z",
      },
    ]);

    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.id)).toEqual([284, 283]);
  });

  it("falls back to the newest completed A pass when A_FULL is unavailable", () => {
    const runs = selectCanonicalViolationReviewRuns([
      {
        id: 10,
        reportArtifactId: 1,
        pass: "A",
        status: "pending",
        completedAt: null,
        createdAt: "2026-05-07T10:00:00.000Z",
      },
      {
        id: 11,
        reportArtifactId: 1,
        pass: "A",
        status: "completed",
        completedAt: "2026-05-07T10:01:00.000Z",
        createdAt: "2026-05-07T10:00:30.000Z",
      },
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(11);
  });
});

