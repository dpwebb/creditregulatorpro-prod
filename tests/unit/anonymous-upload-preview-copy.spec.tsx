import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  AnonymousUploadPreview,
  type SampleProblem,
} from "../../components/AnonymousUploadPreview";

function sampleProblem(index: number): SampleProblem {
  return {
    type: "status_inconsistency",
    title: `Sample finding ${index}`,
    detail: `Sample finding ${index} detail.`,
    solution: `Review sample finding ${index}.`,
    urgency: "violation",
  };
}

function renderPreview(props: {
  problemCount?: number | null;
  sampleProblems: SampleProblem[];
}) {
  return render(
    <MemoryRouter>
      <AnonymousUploadPreview {...props} />
    </MemoryRouter>,
  );
}

describe("anonymous upload preview copy", () => {
  it("states additional findings exist when known total exceeds the shown preview sample", () => {
    renderPreview({
      problemCount: 5,
      sampleProblems: [1, 2, 3, 4, 5].map(sampleProblem),
    });

    const summary = screen.getByRole("note", {
      name: "Preview findings summary",
    });

    expect(summary).toHaveTextContent("Showing 3 sample findings from your report preview.");
    expect(summary).toHaveTextContent(
      "Your report has additional findings not shown in this preview.",
    );
    expect(summary).toHaveTextContent("Findings detected: 5");
    expect(summary).toHaveTextContent("Preview shown: 3");
    expect(summary).not.toHaveTextContent("may be available");
    expect(summary).not.toHaveTextContent("potential problems");
    expect(screen.queryByText("Sample finding 4")).not.toBeInTheDocument();
  });

  it("does not show additional-findings wording when known total fits in the preview", () => {
    renderPreview({
      problemCount: 2,
      sampleProblems: [1, 2].map(sampleProblem),
    });

    const summary = screen.getByRole("note", {
      name: "Preview findings summary",
    });

    expect(summary).toHaveTextContent("Showing 2 sample findings from your report preview.");
    expect(summary).toHaveTextContent("Findings detected: 2");
    expect(summary).toHaveTextContent("Preview shown: 2");
    expect(summary).not.toHaveTextContent("additional findings");
    expect(summary).not.toHaveTextContent("more findings available");
  });

  it("uses may-be-available wording only when the total finding count is unknown", () => {
    renderPreview({
      problemCount: undefined,
      sampleProblems: [1, 2, 3].map(sampleProblem),
    });

    const summary = screen.getByRole("note", {
      name: "Preview findings summary",
    });

    expect(summary).toHaveTextContent(
      "Additional findings may be available after secure account creation.",
    );
    expect(within(summary).queryByText(/Findings detected:/)).not.toBeInTheDocument();
    expect(within(summary).queryByText(/Preview shown:/)).not.toBeInTheDocument();
  });

  it("renders province reporting-limit explanation inline when preview findings use provincial rules", () => {
    renderPreview({
      problemCount: 1,
      sampleProblems: [
        {
          type: "sol_expired",
          title: "Halifax Telecom - Reported Beyond Allowed Period",
          detail:
            "Halifax Telecom is reported beyond Nova Scotia's allowed reporting period.",
          solution:
            "This account is reported beyond Nova Scotia's allowed reporting period.",
          urgency: "expired",
        },
      ],
    });

    const summary = screen.getByRole("note", {
      name: "Preview findings summary",
    });

    expect(summary).toHaveTextContent(
      "Credit reporting rules in Canada vary by province. This report was analyzed using Nova Scotia reporting limits based on the address listed in the uploaded report.",
    );
    expect(summary).not.toHaveTextContent("NS reporting limits");
  });
});
