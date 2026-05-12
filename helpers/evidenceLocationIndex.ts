import type {
  CanonicalTextSourceMethod,
  DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";
import type { DeterministicOcrCoordinateIndex, OcrPageDimensions } from "./deterministicOcr";
import {
  matchOcrEvidenceCoordinates,
  type OcrEvidenceBoundingBox,
} from "./ocrEvidenceCoordinates";
import {
  matchPdfjsEvidenceCoordinates,
  type PdfjsCoordinateIndex,
  type PdfjsEvidenceBoundingBox,
  type PdfjsPageDimensions,
} from "./pdfjsEvidenceCoordinates";

export type EvidenceLocationExtractionMethod = "native_pdf_text" | "ocr_text";

export interface EvidenceLocationProvenance {
  deterministicPipelineVersion: string;
  documentBinarySha256: string;
  rawTextSha256: string;
  canonicalResultSha256: string;
  replayHash: string;
  ocrEngine?: string;
  ocrRenderer?: string;
  ocrOverallConfidence?: number;
  ocrPageConfidence?: number;
}

export type EvidenceLocationBoundingBox = OcrEvidenceBoundingBox | PdfjsEvidenceBoundingBox;
export type EvidenceLocationPageDimensions = OcrPageDimensions | PdfjsPageDimensions;

export interface EvidenceLocationIndexEntry {
  evidenceId: string;
  fieldKey: string;
  sourceField?: string;
  sourceMethod?: CanonicalTextSourceMethod;
  extractionMethod?: EvidenceLocationExtractionMethod;
  pageNumber?: number;
  sectionName?: string;
  zoneName?: string;
  textSnippet?: string;
  tokenIndexes?: number[];
  ruleId?: string;
  confidence?: number;
  boundingBox?: EvidenceLocationBoundingBox;
  coordinateConfidence?: number;
  wordSpanIndexes?: number[];
  itemSpanIndexes?: number[];
  matchedTextHash?: string;
  canonicalValueHash?: string;
  sourceTextHash?: string;
  coordinateExtractorVersion?: string;
  pageDimensions?: EvidenceLocationPageDimensions;
  provenance: EvidenceLocationProvenance;
}

export type EvidenceLocationIndex = Record<string, EvidenceLocationIndexEntry>;

export type EvidenceLocationSummary = EvidenceLocationIndexEntry;

export interface EvidenceLocationResolveContext {
  reportArtifactData?: unknown;
  reportArtifactDataById?: Map<number, unknown> | Record<string, unknown>;
}

export interface EvidenceLocationResolveRequest {
  reportArtifactId?: unknown;
  evidenceId?: unknown;
  fieldKey?: unknown;
  sourceField?: unknown;
  fieldName?: unknown;
}

export interface EvidenceLocationIndexBuildOptions {
  ocrCoordinateIndex?: DeterministicOcrCoordinateIndex | null;
  nativePdfCoordinateIndex?: PdfjsCoordinateIndex | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringIdentifierValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readBoundingBox(value: unknown): EvidenceLocationBoundingBox | undefined {
  if (!isRecord(value)) return undefined;
  const x = nonNegativeFiniteNumber(value.x);
  const y = nonNegativeFiniteNumber(value.y);
  const width = nonNegativeFiniteNumber(value.width);
  const height = nonNegativeFiniteNumber(value.height);
  const pageNumber = positiveInteger(value.pageNumber);
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0 ||
    pageNumber === undefined ||
    value.coordinateValidated !== true
  ) {
    return undefined;
  }

  if (value.unit === "px" && value.coordinateSource === "tesseract_tsv_word") {
    return {
      x,
      y,
      width,
      height,
      unit: "px",
      pageNumber,
      coordinateSource: "tesseract_tsv_word",
      coordinateValidated: true,
    };
  }

  if (value.unit === "pt" && value.coordinateSource === "pdfjs_text_item") {
    return {
      x,
      y,
      width,
      height,
      unit: "pt",
      pageNumber,
      coordinateSource: "pdfjs_text_item",
      coordinateValidated: true,
    };
  }

  return undefined;
}

function readPageDimensions(value: unknown): EvidenceLocationPageDimensions | undefined {
  if (!isRecord(value)) return undefined;
  const width = nonNegativeFiniteNumber(value.width);
  const height = nonNegativeFiniteNumber(value.height);
  if (
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0 ||
    (value.unit !== "px" && value.unit !== "pt")
  ) {
    return undefined;
  }
  return value.unit === "px" ? { width, height, unit: "px" } : { width, height, unit: "pt" };
}

function readProvenance(value: unknown): EvidenceLocationProvenance | null {
  if (!isRecord(value)) return null;
  const deterministicPipelineVersion = stringValue(value.deterministicPipelineVersion);
  const documentBinarySha256 = stringValue(value.documentBinarySha256);
  const rawTextSha256 = stringValue(value.rawTextSha256);
  const canonicalResultSha256 = stringValue(value.canonicalResultSha256);
  const replayHash = stringValue(value.replayHash);
  if (
    !deterministicPipelineVersion ||
    !documentBinarySha256 ||
    !rawTextSha256 ||
    !canonicalResultSha256 ||
    !replayHash
  ) {
    return null;
  }

  return {
    deterministicPipelineVersion,
    documentBinarySha256,
    rawTextSha256,
    canonicalResultSha256,
    replayHash,
    ...(stringValue(value.ocrEngine) ? { ocrEngine: stringValue(value.ocrEngine) } : {}),
    ...(stringValue(value.ocrRenderer) ? { ocrRenderer: stringValue(value.ocrRenderer) } : {}),
    ...(typeof value.ocrOverallConfidence === "number"
      ? { ocrOverallConfidence: value.ocrOverallConfidence }
      : {}),
    ...(typeof value.ocrPageConfidence === "number" ? { ocrPageConfidence: value.ocrPageConfidence } : {}),
  };
}

function compactSnippet(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.split(/\s+/).slice(0, 40).join(" ");
}

function isSourceMethod(value: unknown): value is CanonicalTextSourceMethod {
  return value === "pdf_text" || value === "ocr_text";
}

function extractionMethodFor(sourceMethod: CanonicalTextSourceMethod | undefined): EvidenceLocationExtractionMethod | undefined {
  if (sourceMethod === "pdf_text") return "native_pdf_text";
  if (sourceMethod === "ocr_text") return "ocr_text";
  return undefined;
}

function hasExplicitTextPageBoundaries(pipeline: DeterministicPipelinePackage): boolean {
  return pipeline.rawTokenization.tokens.some((token) => token.pageNumber > 1);
}

function reliablePageNumber(
  pipeline: DeterministicPipelinePackage,
  sourceMethod: CanonicalTextSourceMethod | undefined,
  pageNumber: unknown,
): number | undefined {
  const parsed = Number(pageNumber);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  if (sourceMethod === "ocr_text") return parsed;
  if (sourceMethod === "pdf_text" && hasExplicitTextPageBoundaries(pipeline)) return parsed;
  return undefined;
}

function ocrPageConfidence(pipeline: DeterministicPipelinePackage, pageNumber: number | undefined): number | undefined {
  if (pipeline.sourceMethod !== "ocr_text" || pageNumber === undefined) return undefined;
  const page = pipeline.ocrProvenance?.pages.find((candidate) => candidate.pageNumber === pageNumber);
  return typeof page?.confidence === "number" ? page.confidence : undefined;
}

function provenanceFor(
  pipeline: DeterministicPipelinePackage,
  pageNumber: number | undefined,
): EvidenceLocationProvenance {
  const pageConfidence = ocrPageConfidence(pipeline, pageNumber);
  return {
    deterministicPipelineVersion: pipeline.version,
    documentBinarySha256: pipeline.documentBinarySha256,
    rawTextSha256: pipeline.rawTextSha256,
    canonicalResultSha256: pipeline.canonicalResultSha256,
    replayHash: pipeline.replayHash,
    ...(pipeline.ocrProvenance?.engine ? { ocrEngine: pipeline.ocrProvenance.engine } : {}),
    ...(pipeline.ocrProvenance?.renderer ? { ocrRenderer: pipeline.ocrProvenance.renderer } : {}),
    ...(typeof pipeline.ocrProvenance?.overallConfidence === "number"
      ? { ocrOverallConfidence: pipeline.ocrProvenance.overallConfidence }
      : {}),
    ...(typeof pageConfidence === "number" ? { ocrPageConfidence: pageConfidence } : {}),
  };
}

export function buildEvidenceLocationIndex(
  pipeline: DeterministicPipelinePackage | null | undefined,
  options: EvidenceLocationIndexBuildOptions = {},
): EvidenceLocationIndex {
  if (!pipeline) return {};

  const entries = Object.keys(pipeline.finalOutput.fields)
    .sort()
    .flatMap((fieldKey): Array<[string, EvidenceLocationIndexEntry]> => {
      const field = pipeline.finalOutput.fields[fieldKey];
      const evidence = field.evidence;
      const evidenceId = evidence.evidenceId;
      if (!evidenceId) return [];

      const sourceMethod = isSourceMethod(evidence.sourceMethod) ? evidence.sourceMethod : undefined;
      const pageNumber = reliablePageNumber(pipeline, sourceMethod, evidence.pageNumber);
      const textSnippet = typeof evidence.textSnippet === "string" ? compactSnippet(evidence.textSnippet) : undefined;
      const tokenIndexes = Array.isArray(evidence.tokenIndexes)
        ? evidence.tokenIndexes.filter((index) => Number.isInteger(index))
        : undefined;
      const coordinateMatch =
        sourceMethod === "ocr_text" && pageNumber !== undefined
          ? matchOcrEvidenceCoordinates({
              coordinateIndex: options.ocrCoordinateIndex,
              pageNumber,
              fieldKey,
              textSnippet,
              canonicalValue: field.value,
            })
          : null;
      const nativePdfCoordinateMatch =
        sourceMethod === "pdf_text"
          ? matchPdfjsEvidenceCoordinates({
              coordinateIndex: options.nativePdfCoordinateIndex,
              pageNumber,
              fieldKey,
              textSnippet,
              canonicalValue: field.value,
            })
          : null;

      const entry: EvidenceLocationIndexEntry = {
        evidenceId,
        fieldKey,
        ...(typeof field.sourceMethod === "string" && field.sourceMethod.trim()
          ? { sourceField: field.sourceMethod }
          : {}),
        ...(sourceMethod ? { sourceMethod } : {}),
        ...(extractionMethodFor(sourceMethod) ? { extractionMethod: extractionMethodFor(sourceMethod) } : {}),
        ...(pageNumber !== undefined ? { pageNumber } : {}),
        ...(typeof evidence.sectionName === "string" && evidence.sectionName.trim()
          ? { sectionName: evidence.sectionName }
          : {}),
        ...(typeof evidence.zoneName === "string" && evidence.zoneName.trim()
          ? { zoneName: evidence.zoneName }
          : {}),
        ...(textSnippet ? { textSnippet } : {}),
        ...(tokenIndexes && tokenIndexes.length > 0 ? { tokenIndexes } : {}),
        ...(typeof evidence.ruleId === "string" && evidence.ruleId.trim() ? { ruleId: evidence.ruleId } : {}),
        ...(typeof field.confidence === "number" ? { confidence: field.confidence } : {}),
        ...(coordinateMatch
          ? {
              boundingBox: coordinateMatch.boundingBox,
              coordinateConfidence: coordinateMatch.coordinateConfidence,
              wordSpanIndexes: coordinateMatch.wordSpanIndexes,
              matchedTextHash: coordinateMatch.matchedTextHash,
              ...(coordinateMatch.canonicalValueHash
                ? { canonicalValueHash: coordinateMatch.canonicalValueHash }
                : {}),
              ...(coordinateMatch.sourceTextHash ? { sourceTextHash: coordinateMatch.sourceTextHash } : {}),
              coordinateExtractorVersion: coordinateMatch.coordinateExtractorVersion,
              ...(coordinateMatch.pageDimensions ? { pageDimensions: coordinateMatch.pageDimensions } : {}),
            }
          : {}),
        ...(nativePdfCoordinateMatch
          ? {
              boundingBox: nativePdfCoordinateMatch.boundingBox,
              itemSpanIndexes: nativePdfCoordinateMatch.itemSpanIndexes,
              matchedTextHash: nativePdfCoordinateMatch.matchedTextHash,
              ...(nativePdfCoordinateMatch.canonicalValueHash
                ? { canonicalValueHash: nativePdfCoordinateMatch.canonicalValueHash }
                : {}),
              ...(nativePdfCoordinateMatch.sourceTextHash
                ? { sourceTextHash: nativePdfCoordinateMatch.sourceTextHash }
                : {}),
              coordinateExtractorVersion: nativePdfCoordinateMatch.coordinateExtractorVersion,
              ...(nativePdfCoordinateMatch.pageDimensions
                ? { pageDimensions: nativePdfCoordinateMatch.pageDimensions }
                : {}),
            }
          : {}),
        provenance: provenanceFor(pipeline, pageNumber),
      };

      return [[evidenceId, entry]];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}

function readReportArtifactDataForContext(
  context: EvidenceLocationResolveContext | null | undefined,
  reportArtifactId: unknown,
): unknown {
  const parsedArtifactId = positiveInteger(reportArtifactId);
  if (parsedArtifactId !== undefined && context?.reportArtifactDataById) {
    if (context.reportArtifactDataById instanceof Map) {
      return context.reportArtifactDataById.get(parsedArtifactId);
    }
    const keyed = context.reportArtifactDataById[String(parsedArtifactId)];
    if (keyed !== undefined) return keyed;
  }
  return context?.reportArtifactData;
}

function toEvidenceLocationSummary(value: unknown): EvidenceLocationSummary | null {
  const record = recordValue(value);
  if (!record) return null;
  const evidenceId = stringIdentifierValue(record.evidenceId);
  const fieldKey = stringValue(record.fieldKey);
  const provenance = readProvenance(record.provenance);
  if (!evidenceId || !fieldKey || !provenance) return null;

  const sourceMethod = isSourceMethod(record.sourceMethod) ? record.sourceMethod : undefined;
  const extractionMethod =
    record.extractionMethod === "native_pdf_text" || record.extractionMethod === "ocr_text"
      ? record.extractionMethod
      : undefined;
  const pageNumber = positiveInteger(record.pageNumber);
  const tokenIndexes = Array.isArray(record.tokenIndexes)
    ? record.tokenIndexes.filter((index): index is number => Number.isInteger(index))
    : undefined;
  const wordSpanIndexes = Array.isArray(record.wordSpanIndexes)
    ? record.wordSpanIndexes.filter((index): index is number => Number.isInteger(index) && index >= 0)
    : undefined;
  const itemSpanIndexes = Array.isArray(record.itemSpanIndexes)
    ? record.itemSpanIndexes.filter((index): index is number => Number.isInteger(index) && index >= 0)
    : undefined;
  const boundingBox = readBoundingBox(record.boundingBox);
  const pageDimensions = readPageDimensions(record.pageDimensions);

  return {
    evidenceId,
    fieldKey,
    ...(stringValue(record.sourceField) ? { sourceField: stringValue(record.sourceField) } : {}),
    ...(sourceMethod ? { sourceMethod } : {}),
    ...(extractionMethod ? { extractionMethod } : {}),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(stringValue(record.sectionName) ? { sectionName: stringValue(record.sectionName) } : {}),
    ...(stringValue(record.zoneName) ? { zoneName: stringValue(record.zoneName) } : {}),
    ...(stringValue(record.textSnippet) ? { textSnippet: compactSnippet(stringValue(record.textSnippet)!) } : {}),
    ...(tokenIndexes && tokenIndexes.length > 0 ? { tokenIndexes } : {}),
    ...(stringValue(record.ruleId) ? { ruleId: stringValue(record.ruleId) } : {}),
    ...(typeof record.confidence === "number" ? { confidence: record.confidence } : {}),
    ...(boundingBox ? { boundingBox } : {}),
    ...(typeof record.coordinateConfidence === "number" ? { coordinateConfidence: record.coordinateConfidence } : {}),
    ...(wordSpanIndexes && wordSpanIndexes.length > 0 ? { wordSpanIndexes } : {}),
    ...(itemSpanIndexes && itemSpanIndexes.length > 0 ? { itemSpanIndexes } : {}),
    ...(stringValue(record.matchedTextHash) ? { matchedTextHash: stringValue(record.matchedTextHash) } : {}),
    ...(stringValue(record.canonicalValueHash) ? { canonicalValueHash: stringValue(record.canonicalValueHash) } : {}),
    ...(stringValue(record.sourceTextHash) ? { sourceTextHash: stringValue(record.sourceTextHash) } : {}),
    ...(stringValue(record.coordinateExtractorVersion)
      ? { coordinateExtractorVersion: stringValue(record.coordinateExtractorVersion) }
      : {}),
    ...(pageDimensions ? { pageDimensions } : {}),
    provenance,
  };
}

export function readEvidenceLocationIndex(reportArtifactData: unknown): EvidenceLocationIndex | null {
  const reportData = recordValue(reportArtifactData);
  const evidenceLocationIndex = recordValue(reportData?.evidenceLocationIndex);
  if (!evidenceLocationIndex) return null;

  const entries = Object.entries(evidenceLocationIndex)
    .flatMap(([key, value]): Array<[string, EvidenceLocationIndexEntry]> => {
      const entry = toEvidenceLocationSummary(value);
      const normalizedKey = String(key);
      if (!entry || entry.evidenceId !== normalizedKey) return [];
      return [[normalizedKey, entry]];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function terminalFieldName(fieldKey: string): string {
  return fieldKey.replace(/\[\d+\]/g, "").split(".").at(-1) ?? fieldKey;
}

function entryMatchesFieldName(entry: EvidenceLocationIndexEntry, fieldName: string): boolean {
  return (
    entry.fieldKey === fieldName ||
    terminalFieldName(entry.fieldKey) === fieldName ||
    entry.sourceField === fieldName ||
    Boolean(entry.sourceField?.endsWith(`.${fieldName}`))
  );
}

function matchingEntries(
  entries: EvidenceLocationIndexEntry[],
  predicate: (entry: EvidenceLocationIndexEntry) => boolean,
): EvidenceLocationIndexEntry[] {
  return entries.filter(predicate);
}

export function resolveEvidenceLocation(
  context: EvidenceLocationResolveContext | null | undefined,
  request: EvidenceLocationResolveRequest,
): EvidenceLocationSummary | null {
  const reportArtifactData = readReportArtifactDataForContext(context, request.reportArtifactId);
  const index = readEvidenceLocationIndex(reportArtifactData);
  if (!index) return null;

  const evidenceId = stringIdentifierValue(request.evidenceId);
  if (evidenceId && index[evidenceId]) return toEvidenceLocationSummary(index[evidenceId]);

  const entries = Object.values(index);
  const fieldKey = stringValue(request.fieldKey);
  if (fieldKey) {
    const matches = matchingEntries(entries, (entry) => entry.fieldKey === fieldKey);
    if (matches.length > 1) return null;
    if (matches.length === 1) return toEvidenceLocationSummary(matches[0]);
  }

  const sourceField = stringValue(request.sourceField);
  if (sourceField) {
    const matches = matchingEntries(entries, (entry) => entry.sourceField === sourceField);
    if (matches.length > 1) return null;
    if (matches.length === 1) return toEvidenceLocationSummary(matches[0]);
  }

  const fieldName = stringValue(request.fieldName);
  if (fieldName) {
    const matches = matchingEntries(entries, (entry) => entryMatchesFieldName(entry, fieldName));
    if (matches.length > 1) return null;
    if (matches.length === 1) return toEvidenceLocationSummary(matches[0]);
  }

  return null;
}
