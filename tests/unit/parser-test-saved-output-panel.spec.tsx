import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParserTestSavedOutputPanel } from "../../components/ParserTestSavedOutputPanel";

const savedOutputTestCase = {
  id: 42,
  name: "TransUnion Canada Stage Lab",
  adminReviewStatus: "needs_review",
  bureau: "TransUnion",
  parserMode: "deterministic",
  allowAiFallback: false,
  stageVersion: "stage",
  extractionSource: "pdf",
  expectedConsumerInfo: {
    fullName: "Unknown",
  },
  expectedTradelines: [
    {
      creditorName: "BANK OF NOVA SCOTIA",
      accountNumber: "Unknown",
      status: "Open",
    },
  ],
  rawExtractedText: "sample report text",
};

describe("ParserTestSavedOutputPanel", () => {
  it("defaults Unknown parser results to Not Provided for approved corrections", async () => {
    const onAdjudicate = vi.fn().mockResolvedValue(undefined);

    render(
      <ParserTestSavedOutputPanel
        testCase={savedOutputTestCase}
        onAdjudicate={onAdjudicate}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Corrected / Approved Value")).toHaveValue("Not Provided");
    });
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /save decision/i }));

    await waitFor(() => expect(onAdjudicate).toHaveBeenCalledTimes(1));
    expect(onAdjudicate).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({
          fieldPath: "tradelines[0].accountNumber",
          parsedValue: "Unknown",
          correctValue: "Not Provided",
        }),
      }),
    );
  });

  it("normalizes Unknown values when accepting the full saved output baseline", async () => {
    const onAdjudicate = vi.fn().mockResolvedValue(undefined);

    render(
      <ParserTestSavedOutputPanel
        testCase={savedOutputTestCase}
        onAdjudicate={onAdjudicate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /accept saved output/i }));

    await waitFor(() => expect(onAdjudicate).toHaveBeenCalledTimes(1));
    expect(onAdjudicate).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedConsumerInfo: expect.objectContaining({
          fullName: "Not Provided",
        }),
        approvedTradelines: [
          expect.objectContaining({
            creditorName: "BANK OF NOVA SCOTIA",
            accountNumber: "Not Provided",
            status: "Open",
          }),
        ],
      }),
    );
  });
});
