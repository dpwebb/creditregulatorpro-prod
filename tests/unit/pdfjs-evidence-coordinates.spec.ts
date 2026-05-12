import PdfPrinter from "pdfmake";
import { describe, expect, it } from "vitest";

import {
  extractPdfjsCoordinateIndex,
  matchPdfjsEvidenceCoordinates,
  PDFJS_COORDINATE_EXTRACTOR_VERSION,
  type PdfjsCoordinateIndex,
  type PdfjsTextItemCoordinate,
} from "../../helpers/pdfjsEvidenceCoordinates";

function syntheticPdfBytes(): Promise<Uint8Array> {
  const printer = new PdfPrinter({
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  });
  const document = printer.createPdfKitDocument({
    defaultStyle: { font: "Helvetica", fontSize: 12 },
    content: ["TEST CREDIT REPORT", "BALANCE 123.45", "STATUS OPEN"],
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
    document.end();
  });
}

function pdfItem(
  text: string,
  itemIndex: number,
  x: number,
  pageNumber = 2,
  width = 40,
): PdfjsTextItemCoordinate {
  return {
    pageNumber,
    itemIndex,
    text,
    x,
    y: 20,
    width,
    height: 12,
    unit: "pt",
    pageWidth: 612,
    pageHeight: 792,
    source: "pdfjs_text_item",
  };
}

function coordinateIndex(pages: Array<{ pageNumber: number; items: PdfjsTextItemCoordinate[] }>): PdfjsCoordinateIndex {
  return {
    sourceMethod: "pdf_text",
    coordinateSource: "pdfjs_text_item",
    coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      pageDimensions: { width: 612, height: 792, unit: "pt" },
      items: page.items,
    })),
  };
}

describe("pdfjs native PDF evidence coordinates", () => {
  it("extracts deterministic sidecar text items with page numbers, dimensions, coordinates, and item order", async () => {
    const index = await extractPdfjsCoordinateIndex(await syntheticPdfBytes());

    expect(index).toMatchObject({
      sourceMethod: "pdf_text",
      coordinateSource: "pdfjs_text_item",
      coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
    });
    expect(index?.pages).toHaveLength(1);
    expect(index?.pages[0].pageNumber).toBe(1);
    expect(index?.pages[0].pageDimensions).toEqual(
      expect.objectContaining({ unit: "pt" }),
    );
    expect(index?.pages[0].pageDimensions.width).toBeGreaterThan(0);
    expect(index?.pages[0].pageDimensions.height).toBeGreaterThan(0);

    const items = index?.pages[0].items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((item) => item.text)).toEqual([
      "TEST",
      "CREDIT",
      "REPORT",
      "BALANCE",
      "123.45",
      "STATUS",
      "OPEN",
    ]);
    expect(items[3]).toEqual(
      expect.objectContaining({
        pageNumber: 1,
        itemIndex: 3,
        text: "BALANCE",
        unit: "pt",
        source: "pdfjs_text_item",
      }),
    );
    expect(items[3].x).toBeGreaterThanOrEqual(0);
    expect(items[3].y).toBeGreaterThanOrEqual(0);
    expect(items[3].width).toBeGreaterThan(0);
    expect(items[3].height).toBeGreaterThan(0);
    expect(index).not.toHaveProperty("text");
  });

  it("matches one unambiguous native PDF snippet and unions the item boxes", () => {
    const result = matchPdfjsEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        {
          pageNumber: 2,
          items: [
            pdfItem("BALANCE", 0, 10, 2, 60),
            pdfItem("123.45", 1, 80, 2, 50),
            pdfItem("STATUS", 2, 150, 2, 40),
          ],
        },
      ]),
      pageNumber: 2,
      fieldKey: "tradelines[0].balance",
      textSnippet: "BALANCE 123.45",
      canonicalValue: 123.45,
    });

    expect(result).toMatchObject({
      boundingBox: {
        x: 10,
        y: 20,
        width: 120,
        height: 12,
        unit: "pt",
        pageNumber: 2,
        coordinateSource: "pdfjs_text_item",
        coordinateValidated: true,
      },
      itemSpanIndexes: [0, 1],
      coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
      pageDimensions: { width: 612, height: 792, unit: "pt" },
    });
    expect(result?.matchedTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result?.canonicalValueHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result?.sourceTextHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("omits native PDF coordinates when repeated values make the match ambiguous", () => {
    const result = matchPdfjsEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        {
          pageNumber: 1,
          items: [
            pdfItem("BALANCE", 0, 10, 1),
            pdfItem("123.45", 1, 60, 1),
            pdfItem("BALANCE", 2, 120, 1),
            pdfItem("123.45", 3, 170, 1),
          ],
        },
      ]),
      pageNumber: 1,
      fieldKey: "tradelines[0].balance",
      textSnippet: "BALANCE 123.45",
    });

    expect(result).toBeNull();
  });

  it("omits native PDF coordinates when no text-item span matches", () => {
    const result = matchPdfjsEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        {
          pageNumber: 1,
          items: [pdfItem("BALANCE", 0, 10, 1), pdfItem("123.45", 1, 60, 1)],
        },
      ]),
      pageNumber: 1,
      fieldKey: "tradelines[0].balance",
      textSnippet: "STATUS OPEN",
    });

    expect(result).toBeNull();
  });

  it("omits native PDF coordinates for sensitive overexposure", () => {
    const result = matchPdfjsEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        {
          pageNumber: 1,
          items: [pdfItem("123456789", 0, 10, 1, 80)],
        },
      ]),
      pageNumber: 1,
      fieldKey: "tradelines[0].accountNumber",
      textSnippet: "123456789",
      canonicalValue: "123456789",
    });

    expect(result).toBeNull();
  });

  it("does not default missing evidence pages to page 1", () => {
    const result = matchPdfjsEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        {
          pageNumber: 2,
          items: [pdfItem("STATUS", 0, 10, 2), pdfItem("OPEN", 1, 60, 2)],
        },
      ]),
      fieldKey: "tradelines[0].status",
      textSnippet: "STATUS OPEN",
    });

    expect(result?.boundingBox.pageNumber).toBe(2);
  });

  it("omits native PDF coordinates when missing evidence pages match multiple pages", () => {
    const result = matchPdfjsEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        {
          pageNumber: 1,
          items: [pdfItem("STATUS", 0, 10, 1), pdfItem("OPEN", 1, 60, 1)],
        },
        {
          pageNumber: 2,
          items: [pdfItem("STATUS", 2, 10, 2), pdfItem("OPEN", 3, 60, 2)],
        },
      ]),
      fieldKey: "tradelines[0].status",
      textSnippet: "STATUS OPEN",
    });

    expect(result).toBeNull();
  });
});
