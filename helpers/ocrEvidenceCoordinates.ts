import { sha256Hex } from "./reportBinaryUtils";
import type {
  DeterministicOcrCoordinateIndex,
  OcrPageDimensions,
  TesseractTsvWordBox,
} from "./deterministicOcr";

export const OCR_EVIDENCE_COORDINATE_MIN_CONFIDENCE = 0.8;

export interface OcrEvidenceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "px";
  pageNumber: number;
  coordinateSource: "tesseract_tsv_word";
  coordinateValidated: true;
}

export interface OcrEvidenceCoordinateMatch {
  boundingBox: OcrEvidenceBoundingBox;
  coordinateConfidence: number;
  wordSpanIndexes: number[];
  matchedTextHash: string;
  coordinateExtractorVersion: string;
  canonicalValueHash?: string;
  sourceTextHash?: string;
  pageDimensions?: OcrPageDimensions;
}

export interface OcrEvidenceCoordinateMatchInput {
  coordinateIndex?: DeterministicOcrCoordinateIndex | null;
  pageNumber?: number;
  fieldKey: string;
  textSnippet?: string;
  canonicalValue?: unknown;
}

interface CandidateText {
  text: string;
  kind: "source" | "canonical";
}

function hashText(value: string): string {
  return sha256Hex(value);
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

function candidateTexts(input: OcrEvidenceCoordinateMatchInput): CandidateText[] {
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

function findConsecutiveMatches(words: TesseractTsvWordBox[], targetKeys: string[]): TesseractTsvWordBox[][] {
  if (targetKeys.length === 0 || words.length < targetKeys.length) return [];
  const wordKeys = words.map((word) => normalizeMatchKey(word.text));
  const matches: TesseractTsvWordBox[][] = [];

  for (let start = 0; start <= words.length - targetKeys.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < targetKeys.length; offset += 1) {
      if (wordKeys[start + offset] !== targetKeys[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push(words.slice(start, start + targetKeys.length));
  }

  return matches;
}

function averageConfidence(words: TesseractTsvWordBox[]): number | null {
  const values = words
    .map((word) => word.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function unionBoundingBox(words: TesseractTsvWordBox[]): OcrEvidenceBoundingBox {
  const left = Math.min(...words.map((word) => word.left));
  const top = Math.min(...words.map((word) => word.top));
  const right = Math.max(...words.map((word) => word.left + word.width));
  const bottom = Math.max(...words.map((word) => word.top + word.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    unit: "px",
    pageNumber: words[0].pageNumber,
    coordinateSource: "tesseract_tsv_word",
    coordinateValidated: true,
  };
}

export function matchOcrEvidenceCoordinates(
  input: OcrEvidenceCoordinateMatchInput,
): OcrEvidenceCoordinateMatch | null {
  if (!input.coordinateIndex || input.pageNumber === undefined) return null;
  const page = input.coordinateIndex.pages.find((candidate) => candidate.pageNumber === input.pageNumber);
  if (!page) return null;
  const words = page.words.filter((word) => word.pageNumber === input.pageNumber && word.text.trim());
  if (words.length === 0) return null;

  for (const candidate of candidateTexts(input)) {
    if (hasSensitiveOverexposure(input.fieldKey, candidate.text)) continue;

    const targetKeys = matchKeys(candidate.text);
    const matches = findConsecutiveMatches(words, targetKeys);
    if (matches.length > 1) return null;
    if (matches.length === 0) continue;

    const matchedWords = matches[0];
    const matchedText = matchedWords.map((word) => word.text).join(" ");
    if (hasSensitiveOverexposure(input.fieldKey, matchedText)) continue;

    const coordinateConfidence = averageConfidence(matchedWords);
    if (
      coordinateConfidence === null ||
      coordinateConfidence < OCR_EVIDENCE_COORDINATE_MIN_CONFIDENCE
    ) {
      return null;
    }

    return {
      boundingBox: unionBoundingBox(matchedWords),
      coordinateConfidence,
      wordSpanIndexes: matchedWords.map((word) => word.wordIndex),
      matchedTextHash: hashText(matchedText),
      coordinateExtractorVersion: input.coordinateIndex.coordinateExtractorVersion,
      ...(scalarCanonicalText(input.canonicalValue)
        ? { canonicalValueHash: hashText(scalarCanonicalText(input.canonicalValue)!) }
        : {}),
      ...(input.textSnippet ? { sourceTextHash: hashText(input.textSnippet) } : {}),
      ...(page.pageDimensions ? { pageDimensions: page.pageDimensions } : {}),
    };
  }

  return null;
}
