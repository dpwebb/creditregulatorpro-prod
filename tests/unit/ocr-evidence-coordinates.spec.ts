import { describe, expect, it } from "vitest";

import {
  OCR_COORDINATE_EXTRACTOR_VERSION,
  parseTesseractTsv,
  type DeterministicOcrCoordinateIndex,
  type TesseractTsvWordBox,
} from "../../helpers/deterministicOcr";
import { matchOcrEvidenceCoordinates } from "../../helpers/ocrEvidenceCoordinates";

const TSV_HEADER = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

function word(
  text: string,
  wordIndex: number,
  left: number,
  confidence = 0.95,
  pageNumber = 2,
): TesseractTsvWordBox {
  return {
    wordIndex,
    pageNumber,
    blockNumber: 1,
    paragraphNumber: 1,
    lineNumber: 1,
    wordNumber: wordIndex + 1,
    left,
    top: 20,
    width: 20,
    height: 10,
    confidence,
    text,
  };
}

function coordinateIndex(words: TesseractTsvWordBox[]): DeterministicOcrCoordinateIndex {
  return {
    sourceMethod: "ocr_text",
    coordinateSource: "tesseract_tsv_word",
    coordinateExtractorVersion: OCR_COORDINATE_EXTRACTOR_VERSION,
    pages: [
      {
        pageNumber: 2,
        pageDimensions: { width: 800, height: 1000, unit: "px" },
        words,
      },
    ],
  };
}

describe("Tesseract TSV OCR coordinates", () => {
  it("parses valid word rows with coordinates, confidence, text, and page metadata", () => {
    const tsv = [
      TSV_HEADER,
      "1\t1\t0\t0\t0\t0\t0\t0\t800\t1000\t-1\t",
      "5\t1\t3\t4\t5\t6\t10\t20\t30\t12\t96\tSample",
      "5\t1\t3\t4\t5\t7\t45\t20\t35\t12\t90\tBank",
    ].join("\n");

    const parsed = parseTesseractTsv(tsv, { pageNumber: 2, wordIndexStart: 10 });

    expect(parsed.confidence).toBe(0.93);
    expect(parsed.wordCount).toBe(2);
    expect(parsed.pageDimensions).toEqual({ width: 800, height: 1000, unit: "px" });
    expect(parsed.wordBoxes[0]).toMatchObject({
      wordIndex: 10,
      pageNumber: 2,
      blockNumber: 3,
      paragraphNumber: 4,
      lineNumber: 5,
      wordNumber: 6,
      left: 10,
      top: 20,
      width: 30,
      height: 12,
      confidence: 0.96,
      text: "Sample",
    });
  });

  it("ignores invalid TSV rows and does not invent page numbers", () => {
    const tsv = [
      TSV_HEADER,
      "5\t\t1\t1\t1\t1\t10\t20\t30\t12\t96\tNoPage",
      "5\t1\t1\t1\t1\t2\tbad\t20\t30\t12\t96\tBadLeft",
      "5\t1\t1\t1\t1\t3\t10\t20\t-30\t12\t96\tBadWidth",
      "4\t1\t1\t1\t1\t4\t10\t20\t30\t12\t96\tNotWord",
      "5\t1\t1\t1\t1\t5\t10\t20\t30\t12\t\tNoConfidence",
      "5\t1\t1\t1\t1\t6\t45\t20\t35\t12\t91\tValid",
      "5\t1\t1\t1\t1\t7\t80\t20\t35\t12\t91\t",
    ].join("\n");

    const parsed = parseTesseractTsv(tsv);

    expect(parsed.wordBoxes.map((box) => box.text)).toEqual(["NoConfidence", "Valid"]);
    expect(parsed.wordBoxes[0]).toMatchObject({
      pageNumber: 1,
      left: 10,
      top: 20,
      width: 30,
      height: 12,
      confidence: null,
    });
    expect(parsed.confidence).toBe(0.91);
  });

  it("matches one unambiguous OCR snippet to consecutive TSV words and unions the box", () => {
    const result = matchOcrEvidenceCoordinates({
      coordinateIndex: coordinateIndex([word("SCAN", 0, 10), word("BANK", 1, 35), word("VISA", 2, 70)]),
      pageNumber: 2,
      fieldKey: "tradelines[0].creditorName",
      textSnippet: "SCAN BANK VISA",
      canonicalValue: "SCAN BANK VISA",
    });

    expect(result).toMatchObject({
      boundingBox: {
        x: 10,
        y: 20,
        width: 80,
        height: 10,
        unit: "px",
        pageNumber: 2,
        coordinateSource: "tesseract_tsv_word",
        coordinateValidated: true,
      },
      coordinateConfidence: 0.95,
      wordSpanIndexes: [0, 1, 2],
      coordinateExtractorVersion: OCR_COORDINATE_EXTRACTOR_VERSION,
      pageDimensions: { width: 800, height: 1000, unit: "px" },
    });
    expect(result?.matchedTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result?.canonicalValueHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result?.sourceTextHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("omits coordinates when the OCR word span is ambiguous", () => {
    const result = matchOcrEvidenceCoordinates({
      coordinateIndex: coordinateIndex([
        word("SCAN", 0, 10),
        word("BANK", 1, 35),
        word("SCAN", 2, 70),
        word("BANK", 3, 95),
      ]),
      pageNumber: 2,
      fieldKey: "tradelines[0].creditorName",
      textSnippet: "SCAN BANK",
    });

    expect(result).toBeNull();
  });

  it("omits coordinates when no OCR word span matches", () => {
    const result = matchOcrEvidenceCoordinates({
      coordinateIndex: coordinateIndex([word("SCAN", 0, 10), word("BANK", 1, 35)]),
      pageNumber: 2,
      fieldKey: "tradelines[0].creditorName",
      textSnippet: "OTHER BANK",
    });

    expect(result).toBeNull();
  });

  it("omits coordinates when matched OCR confidence is below the safe threshold", () => {
    const result = matchOcrEvidenceCoordinates({
      coordinateIndex: coordinateIndex([word("SCAN", 0, 10, 0.72), word("BANK", 1, 35, 0.74)]),
      pageNumber: 2,
      fieldKey: "tradelines[0].creditorName",
      textSnippet: "SCAN BANK",
    });

    expect(result).toBeNull();
  });

  it("omits coordinates when a match would expose full sensitive identifiers", () => {
    const result = matchOcrEvidenceCoordinates({
      coordinateIndex: coordinateIndex([word("123456789", 0, 10)]),
      pageNumber: 2,
      fieldKey: "tradelines[0].accountNumber",
      textSnippet: "123456789",
      canonicalValue: "123456789",
    });

    expect(result).toBeNull();
  });
});
