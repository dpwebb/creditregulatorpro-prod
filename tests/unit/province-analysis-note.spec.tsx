import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProvinceAnalysisNote } from "../../components/ProvinceAnalysisNote";

describe("province analysis note", () => {
  it("renders a visible inline explanation with the full province name", () => {
    render(<ProvinceAnalysisNote province="NS" />);

    const note = screen.getByText(
      "Credit reporting rules in Canada vary by province. This report was analyzed using Nova Scotia reporting limits based on the address listed in the uploaded report.",
    );

    expect(note).toBeVisible();
    expect(note.tagName).toBe("P");
    expect(note).not.toHaveTextContent("NS");
  });

  it("renders likely-province wording when confidence is uncertain", () => {
    render(<ProvinceAnalysisNote province="BC" mode="likely" />);

    const note = screen.getByText(
      "We detected British Columbia as the likely reporting province based on the uploaded report address.",
    );

    expect(note).toBeVisible();
    expect(note).not.toHaveTextContent("BC");
  });

  it("renders unavailable-province wording without interaction", () => {
    render(<ProvinceAnalysisNote province={null} />);

    expect(
      screen.getByText("We could not determine the reporting province from the uploaded report."),
    ).toBeVisible();
  });
});
