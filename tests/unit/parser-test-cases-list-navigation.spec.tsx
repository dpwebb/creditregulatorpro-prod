import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParserTestCasesList } from "../../components/ParserTestCasesList";

const testCase = {
  id: 42,
  name: "TransUnion Canada Stage Lab",
  description: "",
  lastRunPassed: true,
  lastRunAt: "2026-05-06T13:00:00.000Z",
  adminReviewStatus: "needs_review",
  bureau: "TransUnion Canada",
  parserMode: "deterministic",
  allowAiFallback: false,
  stageVersion: "parser-lab-shadow",
  extractionSource: "pdf_text",
  expectedConsumerInfo: {
    fullName: "DAVID PHILIP WEBB",
  },
  expectedTradelines: [
    {
      creditorName: "BANK OF NOVA SCOTIA",
      accountNumber: "Not Provided by Bureau",
      status: "Open",
    },
  ],
  rawExtractedText: "sample report text",
};

const runResult = {
  lastRunAt: "2026-05-06T14:00:00.000Z",
  summary: {
    passed: true,
    hasExpectations: true,
    needsReview: false,
    consumerInfoResults: [
      {
        fieldName: "fullName",
        expected: "DAVID PHILIP WEBB",
        actual: "DAVID PHILIP WEBB",
        passed: true,
        mode: "exact",
      },
    ],
    tradelineResults: [],
    patternSuggestions: {},
  },
  actualConsumerInfo: {
    fullName: "DAVID PHILIP WEBB",
    confidence: 100,
  },
  actualTradelines: [
    {
      creditorName: "BANK OF NOVA SCOTIA",
      accountNumber: "Not Provided by Bureau",
      status: "Open",
    },
  ],
};

function renderList() {
  return render(
    <ParserTestCasesList
      testCases={[testCase]}
      isLoading={false}
      runResults={{ 42: runResult }}
      onRun={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onAcceptResults={vi.fn()}
      onAdjudicate={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe("ParserTestCasesList", () => {
  it("can return from latest run results to saved parser output", () => {
    renderList();

    fireEvent.click(screen.getByText("TransUnion Canada Stage Lab"));

    expect(screen.getByRole("heading", { name: "Test Results" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /saved output/i }));

    expect(screen.getByRole("heading", { name: "Saved Parser Output" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /last run results/i }));

    expect(screen.getByRole("heading", { name: "Test Results" })).toBeInTheDocument();
  });
});
