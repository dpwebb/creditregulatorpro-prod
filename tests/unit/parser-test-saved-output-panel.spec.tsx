import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParserTestSavedOutputPanel } from "../../components/ParserTestSavedOutputPanel";
import { EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE } from "../../helpers/parserRulePromotionDecision";

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

  it("shows ISO parser dates as the bureau calendar date", async () => {
    const onAdjudicate = vi.fn().mockResolvedValue(undefined);

    render(
      <ParserTestSavedOutputPanel
        testCase={{
          ...savedOutputTestCase,
          expectedTradelines: [
            {
              creditorName: "CAPITAL ONE BANK",
              accountNumber: "1234",
              dates: {
                opened: "2026-04-16T00:00:00.000Z",
              },
            },
          ],
        }}
        onAdjudicate={onAdjudicate}
      />,
    );

    fireEvent.change(screen.getByLabelText("Field to Review"), {
      target: { value: "tradeline|CAPITAL ONE BANK|tradelines[0].dates.opened" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Corrected / Approved Value")).toHaveValue("2026-04-16");
    });
    expect(screen.getAllByText("2026-04-16").length).toBeGreaterThan(0);
  });

  it("marks a decision accepted locally when promotion reuses an existing active rule", async () => {
    const onPromoteParserRule = vi.fn().mockResolvedValue({
      activated: true,
      message: EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE,
      candidate: {
        status: "activated",
      },
      targetValidation: {
        passed: true,
        reason: null,
      },
    });

    render(
      <ParserTestSavedOutputPanel
        testCase={{
          ...savedOutputTestCase,
          adjudicationDecisions: [
            {
              id: "decision-1",
              decision: "missing",
              entityType: "tradeline",
              entityKey: "BANK OF NOVA SCOTIA",
              fieldPath: "tradelines[0].remarkCodes",
              parsedValue: null,
              correctValue: ["AC-Account closed/rating non derogatory"],
            },
          ],
        }}
        onPromoteParserRule={onPromoteParserRule}
      />,
    );

    expect(screen.getByRole("button", { name: /promote rule/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /promote rule/i }));

    await waitFor(() => {
      expect(screen.getByText("Accepted")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /promote rule/i })).not.toBeInTheDocument();
  });
});
