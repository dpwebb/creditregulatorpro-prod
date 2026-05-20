import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function renderList(overrides: Partial<ComponentProps<typeof ParserTestCasesList>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const onEdit = overrides.onEdit ?? vi.fn();
  return render(
    <QueryClientProvider client={queryClient}>
      <ParserTestCasesList
        testCases={[testCase]}
        isLoading={false}
        runResults={{ 42: runResult }}
        onRun={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onAcceptResults={vi.fn()}
        onAdjudicate={vi.fn().mockResolvedValue(undefined)}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe("ParserTestCasesList", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            testCase: {
              ...testCase,
              rawExtractedText: "sample report text from admin-only detail",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can return from latest run results to saved parser output and hydrate raw text from detail", async () => {
    renderList();

    fireEvent.click(screen.getByText("TransUnion Canada Stage Lab"));

    expect(screen.getByRole("heading", { name: "Test Results" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /saved output/i }));

    expect(screen.getByRole("heading", { name: "Saved Parser Output" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/sample report text from admin-only detail/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /last run results/i }));

    expect(screen.getByRole("heading", { name: "Test Results" })).toBeInTheDocument();
  });

  it("hydrates admin-only detail before edit preview consumers receive a list item", async () => {
    const onEdit = vi.fn();
    renderList({ onEdit });

    fireEvent.click(screen.getByTitle("Edit"));

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 42,
          rawExtractedText: "sample report text from admin-only detail",
        }),
      ),
    );
  });
});
