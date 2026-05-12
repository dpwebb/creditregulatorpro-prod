import { sha256Hex } from "./reportBinaryUtils";

export const PDFJS_COORDINATE_EXTRACTOR_VERSION = "pdfjs-coordinate-extractor-v1";

export interface PdfjsPageDimensions {
  width: number;
  height: number;
  unit: "pt";
}

export interface PdfjsTextItemCoordinate {
  pageNumber: number;
  itemIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "pt";
  pageWidth: number;
  pageHeight: number;
  source: "pdfjs_text_item";
}

export interface PdfjsCoordinatePage {
  pageNumber: number;
  pageDimensions: PdfjsPageDimensions;
  items: PdfjsTextItemCoordinate[];
}

export interface PdfjsCoordinateIndex {
  sourceMethod: "pdf_text";
  coordinateSource: "pdfjs_text_item";
  coordinateExtractorVersion: typeof PDFJS_COORDINATE_EXTRACTOR_VERSION;
  pages: PdfjsCoordinatePage[];
}

export interface PdfjsEvidenceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "pt";
  pageNumber: number;
  coordinateSource: "pdfjs_text_item";
  coordinateValidated: true;
}

export interface PdfjsEvidenceCoordinateMatch {
  boundingBox: PdfjsEvidenceBoundingBox;
  itemSpanIndexes: number[];
  matchedTextHash: string;
  coordinateExtractorVersion: string;
  canonicalValueHash?: string;
  sourceTextHash?: string;
  pageDimensions?: PdfjsPageDimensions;
}

export interface PdfjsEvidenceCoordinateMatchInput {
  coordinateIndex?: PdfjsCoordinateIndex | null;
  pageNumber?: number;
  fieldKey: string;
  textSnippet?: string;
  canonicalValue?: unknown;
}

interface CandidateText {
  text: string;
  kind: "source" | "canonical";
}

interface PdfjsTextToken {
  key: string;
  text: string;
  item: PdfjsTextItemCoordinate;
}

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

function hashText(value: string): string {
  return sha256Hex(value);
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeMatchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchKeys(value: string): string[] {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(normalizeMatchKey)
    .filter(Boolean);
}

function scalarCanonicalText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function candidateTexts(input: PdfjsEvidenceCoordinateMatchInput): CandidateText[] {
  const candidates: CandidateText[] = [];
  if (input.textSnippet?.trim()) {
    candidates.push({ text: input.textSnippet.trim(), kind: "source" });
  }
  const canonical = scalarCanonicalText(input.canonicalValue);
  if (canonical && canonical !== input.textSnippet?.trim()) {
    candidates.push({ text: canonical, kind: "canonical" });
  }
  return candidates;
}

function hasFullSin(value: string): boolean {
  return /\b(?:\d{3}[-\s]?\d{3}[-\s]?\d{3}|\d{9})\b/.test(value);
}

function hasUnmaskedLongNumber(value: string): boolean {
  return Array.from(value.matchAll(/\d[\d\s-]{7,}\d/g)).some(
    (match) => match[0].replace(/\D/g, "").length >= 9,
  );
}

function hasSensitiveOverexposure(fieldKey: string, value: string): boolean {
  const keys = matchKeys(value);
  if (keys.length > 16 || value.length > 140) return true;
  if (hasFullSin(value)) return true;
  if (/accountNumber|sin/i.test(fieldKey) && hasUnmaskedLongNumber(value)) return true;
  return hasUnmaskedLongNumber(value);
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteCoordinate(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function itemText(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("str" in value)) return null;
  const text = (value as { str?: unknown }).str;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function itemTransform(value: unknown): number[] | null {
  if (!value || typeof value !== "object" || !("transform" in value)) return null;
  const transform = (value as { transform?: unknown }).transform;
  if (!Array.isArray(transform) || transform.length < 6) return null;
  const parsed = transform.map((part) => Number(part));
  return parsed.every(Number.isFinite) ? parsed : null;
}

function textItemCoordinates(params: {
  item: unknown;
  viewport: { width: number; height: number; convertToViewportRectangle(rect: number[]): number[] };
  pageNumber: number;
  itemIndex: number;
}): PdfjsTextItemCoordinate | null {
  const text = itemText(params.item);
  const transform = itemTransform(params.item);
  if (!text || !transform) return null;

  const width = finitePositive((params.item as { width?: unknown }).width);
  const height = finitePositive((params.item as { height?: unknown }).height);
  const sourceX = finiteCoordinate(transform[4]);
  const sourceY = finiteCoordinate(transform[5]);
  const pageWidth = finitePositive(params.viewport.width);
  const pageHeight = finitePositive(params.viewport.height);
  if (
    width === null ||
    height === null ||
    sourceX === null ||
    sourceY === null ||
    pageWidth === null ||
    pageHeight === null
  ) {
    return null;
  }

  const rect = params.viewport.convertToViewportRectangle([
    sourceX,
    sourceY,
    sourceX + width,
    sourceY + height,
  ]);
  if (!Array.isArray(rect) || rect.length < 4 || !rect.every((part) => Number.isFinite(Number(part)))) {
    return null;
  }

  const left = Math.min(Number(rect[0]), Number(rect[2]));
  const top = Math.min(Number(rect[1]), Number(rect[3]));
  const right = Math.max(Number(rect[0]), Number(rect[2]));
  const bottom = Math.max(Number(rect[1]), Number(rect[3]));
  const boxWidth = right - left;
  const boxHeight = bottom - top;
  if (boxWidth <= 0 || boxHeight <= 0) return null;

  return {
    pageNumber: params.pageNumber,
    itemIndex: params.itemIndex,
    text,
    x: roundCoordinate(left),
    y: roundCoordinate(top),
    width: roundCoordinate(boxWidth),
    height: roundCoordinate(boxHeight),
    unit: "pt",
    pageWidth: roundCoordinate(pageWidth),
    pageHeight: roundCoordinate(pageHeight),
    source: "pdfjs_text_item",
  };
}

async function loadPdfjs(): Promise<PdfjsModule> {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export async function extractPdfjsCoordinateIndex(pdfBytes: Uint8Array | Buffer): Promise<PdfjsCoordinateIndex | null> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(pdfBytes);
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  try {
    const pages: PdfjsCoordinatePage[] = [];
    let itemIndex = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageDimensions: PdfjsPageDimensions = {
        width: roundCoordinate(Number(viewport.width)),
        height: roundCoordinate(Number(viewport.height)),
        unit: "pt",
      };
      const textContent = await page.getTextContent();
      const items: PdfjsTextItemCoordinate[] = [];

      for (const item of textContent.items) {
        const coordinate = textItemCoordinates({
          item,
          viewport,
          pageNumber,
          itemIndex,
        });
        if (coordinate) {
          items.push(coordinate);
          itemIndex += 1;
        }
      }

      pages.push({ pageNumber, pageDimensions, items });
    }

    return {
      sourceMethod: "pdf_text",
      coordinateSource: "pdfjs_text_item",
      coordinateExtractorVersion: PDFJS_COORDINATE_EXTRACTOR_VERSION,
      pages,
    };
  } finally {
    await pdf.destroy();
  }
}

function tokensForItems(items: PdfjsTextItemCoordinate[]): PdfjsTextToken[] {
  return items.flatMap((item) =>
    item.text
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((text) => ({ text, key: normalizeMatchKey(text), item }))
      .filter((token) => token.key),
  );
}

function uniqueItems(tokens: PdfjsTextToken[]): PdfjsTextItemCoordinate[] {
  const byIndex = new Map<number, PdfjsTextItemCoordinate>();
  for (const token of tokens) {
    byIndex.set(token.item.itemIndex, token.item);
  }
  return [...byIndex.values()].sort((left, right) => left.itemIndex - right.itemIndex);
}

function findConsecutiveMatches(
  items: PdfjsTextItemCoordinate[],
  targetKeys: string[],
): PdfjsTextToken[][] {
  const tokens = tokensForItems(items);
  if (targetKeys.length === 0 || tokens.length < targetKeys.length) return [];
  const matches: PdfjsTextToken[][] = [];

  for (let start = 0; start <= tokens.length - targetKeys.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < targetKeys.length; offset += 1) {
      if (tokens[start + offset].key !== targetKeys[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push(tokens.slice(start, start + targetKeys.length));
  }

  return matches;
}

function unionBoundingBox(items: PdfjsTextItemCoordinate[]): PdfjsEvidenceBoundingBox {
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));

  return {
    x: roundCoordinate(left),
    y: roundCoordinate(top),
    width: roundCoordinate(right - left),
    height: roundCoordinate(bottom - top),
    unit: "pt",
    pageNumber: items[0].pageNumber,
    coordinateSource: "pdfjs_text_item",
    coordinateValidated: true,
  };
}

function pageCandidates(
  coordinateIndex: PdfjsCoordinateIndex,
  pageNumber: number | undefined,
): PdfjsCoordinatePage[] {
  if (pageNumber === undefined) return coordinateIndex.pages;
  return coordinateIndex.pages.filter((page) => page.pageNumber === pageNumber);
}

export function matchPdfjsEvidenceCoordinates(
  input: PdfjsEvidenceCoordinateMatchInput,
): PdfjsEvidenceCoordinateMatch | null {
  if (!input.coordinateIndex) return null;
  const pages = pageCandidates(input.coordinateIndex, input.pageNumber);
  if (pages.length === 0) return null;

  for (const candidate of candidateTexts(input)) {
    if (hasSensitiveOverexposure(input.fieldKey, candidate.text)) continue;

    const targetKeys = matchKeys(candidate.text);
    const matches = pages.flatMap((page) =>
      findConsecutiveMatches(page.items, targetKeys).map((tokens) => ({ page, tokens })),
    );
    if (matches.length > 1) return null;
    if (matches.length === 0) continue;

    const match = matches[0];
    const matchedText = match.tokens.map((token) => token.text).join(" ");
    const matchedItems = uniqueItems(match.tokens);
    const matchedItemText = matchedItems.map((item) => item.text).join(" ");
    if (
      matchedItems.length === 0 ||
      hasSensitiveOverexposure(input.fieldKey, matchedText) ||
      hasSensitiveOverexposure(input.fieldKey, matchedItemText)
    ) {
      continue;
    }

    return {
      boundingBox: unionBoundingBox(matchedItems),
      itemSpanIndexes: matchedItems.map((item) => item.itemIndex),
      matchedTextHash: hashText(matchedText),
      coordinateExtractorVersion: input.coordinateIndex.coordinateExtractorVersion,
      ...(scalarCanonicalText(input.canonicalValue)
        ? { canonicalValueHash: hashText(scalarCanonicalText(input.canonicalValue)!) }
        : {}),
      ...(input.textSnippet ? { sourceTextHash: hashText(input.textSnippet) } : {}),
      pageDimensions: match.page.pageDimensions,
    };
  }

  return null;
}
