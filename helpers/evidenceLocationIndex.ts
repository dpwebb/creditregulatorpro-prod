import type {
  CanonicalTextSourceMethod,
  DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";

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
  provenance: EvidenceLocationProvenance;
}

export type EvidenceLocationIndex = Record<string, EvidenceLocationIndexEntry>;

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
        provenance: provenanceFor(pipeline, pageNumber),
      };

      return [[evidenceId, entry]];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}
