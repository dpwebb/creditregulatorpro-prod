import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParserTestCaseEditor } from "../../components/ParserTestCaseEditor";

describe("ParserTestCaseEditor", () => {
  it("renders saved extracted text in the edit preview", () => {
    render(
      <ParserTestCaseEditor
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        testCase={{
          id: 42,
          name: "TransUnion Canada Stage Lab",
          description: "Created from Stage Lab parser run.",
          rawExtractedText: "CONSUMER RELATIONS CENTRE\nTU Case IDL121322\nBANK OF NOVA SCOTIA",
          expectedConsumerInfo: {
            fullName: "DAVID PHILIP WEBB",
          },
          expectedTradelines: [],
        }}
      />,
    );

    expect(screen.getByText("Extracted Text Preview")).toBeInTheDocument();
    expect(screen.getByText(/CONSUMER RELATIONS CENTRE/)).toBeInTheDocument();
    expect(screen.getByText(/TU Case IDL121322/)).toBeInTheDocument();
  });
});
