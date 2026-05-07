import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActualTradelineCard } from "../../components/ParserTestActualTradelineCard";
import { TradelineResultCard } from "../../components/ParserTestTradelineCard";

describe("parser test tradeline cards", () => {
  it("uses creditor headings and formats comparison dollar fields", () => {
    render(
      <TradelineResultCard
        result={{
          creditorName: "ROGERS COMMUNICATIONS CANADA INC",
          accountNumber: "123456",
          passed: false,
          fieldResults: [
            {
              fieldName: "Balance",
              expected: 1234.5,
              actual: "1234.5",
              passed: true,
              mode: "exact",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Creditor Name: ROGERS COMMUNICATIONS CANADA INC")).toBeInTheDocument();
    expect(screen.queryByText(/Account:/)).not.toBeInTheDocument();
    expect(screen.getAllByText("$1,234.50").length).toBe(2);
  });

  it("standardizes extracted tradeline missing values, date rows, remarks, and review notes", () => {
    render(
      <ActualTradelineCard
        index={0}
        tradeline={{
          creditorName: "ROGERS COMMUNICATIONS CANADA INC",
          accountNumber: "Unknown",
          accountType: "Open",
          status: "Closed at consumers request",
          balance: 10,
          amounts: {
            high: 1234.5,
            pastDue: 0,
          },
          dates: {},
          remarkCodes: ["AC, XB"],
          paymentHistory: null,
          paymentHistoryDetails: null,
        }}
      />,
    );

    expect(screen.getByText("Creditor Name: ROGERS COMMUNICATIONS CANADA INC")).toBeInTheDocument();
    expect(screen.getByText(/Report Entry #1/)).toHaveTextContent(
      "Account Number: Not Provided by Bureau",
    );
    expect(screen.queryByText("(Unknown)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Creditor Name: ROGERS/i }));

    expect(screen.getAllByText("Not Provided by Bureau").length).toBeGreaterThan(0);
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("$1,234.50")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("Charge Off Date")).toBeInTheDocument();
    expect(screen.getByText("Balloon Payment Date")).toBeInTheDocument();
    expect(screen.getByText("AC")).toBeInTheDocument();
    expect(screen.getByText("XB")).toBeInTheDocument();
    expect(screen.getByText("Date Reporting Review Note")).toBeInTheDocument();
    expect(screen.getByText("Status / Type Review Note")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "30 Days" })).toBeInTheDocument();
  });
});
