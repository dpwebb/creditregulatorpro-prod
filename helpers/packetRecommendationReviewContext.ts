import type {
  ViolationPacketConfidenceGate,
  ViolationPacketGateBlockerCode,
} from "./violationPacketConfidenceGate";

export type PacketRecommendationReviewContext = {
  required: boolean;
  blockerCode: ViolationPacketGateBlockerCode | null;
  parserStatus: ViolationPacketConfidenceGate["status"];
  confidenceScore: number | null;
  message: string;
  reasonCodes: string[];
  reportArtifactId: number | null;
  reviewUrl: string;
  evidenceSummary: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function primitiveSummary(label: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") return null;
  const text = String(value).trim();
  return text ? `${label}: ${text}` : null;
}

export function extractReportArtifactIdFromTechnicalDetails(
  technicalDetails: unknown,
): number | null {
  const details = isRecord(technicalDetails) ? technicalDetails : null;
  if (!details) return null;

  return (
    toFiniteNumber(details.sourceReportArtifactId) ??
    toFiniteNumber(details.reportArtifactId) ??
    toFiniteNumber(details.artifactId)
  );
}

export function extractParserGateReasonCodes(technicalDetails: unknown): string[] {
  const details = isRecord(technicalDetails) ? technicalDetails : null;
  const gate = isRecord(details?.extractionConfidenceGate)
    ? details.extractionConfidenceGate
    : null;
  if (!Array.isArray(gate?.reasonCodes)) return [];

  return gate.reasonCodes.filter((code): code is string => typeof code === "string");
}

export function buildPacketRecommendationReviewContext(input: {
  tradelineId: number;
  violationId: number;
  packetConfidenceGate: ViolationPacketConfidenceGate;
  technicalDetails: unknown;
  reportArtifactId?: number | null;
}): PacketRecommendationReviewContext {
  const details = isRecord(input.technicalDetails) ? input.technicalDetails : null;
  const reportArtifactId =
    extractReportArtifactIdFromTechnicalDetails(details) ??
    input.reportArtifactId ??
    null;
  const evidenceSummary = [
    primitiveSummary("Reviewed field", details?.fieldName),
    primitiveSummary("Detected value", details?.detectedValue),
    primitiveSummary("Expected value", details?.expectedValue),
    primitiveSummary("Reported value", details?.reportedValue),
    primitiveSummary("Source artifact", reportArtifactId),
  ].filter((item): item is string => Boolean(item));

  return {
    required: !input.packetConfidenceGate.packetReady,
    blockerCode: input.packetConfidenceGate.blockerCode,
    parserStatus: input.packetConfidenceGate.status,
    confidenceScore: input.packetConfidenceGate.confidenceScore,
    message: input.packetConfidenceGate.message,
    reasonCodes: extractParserGateReasonCodes(details),
    reportArtifactId,
    reviewUrl: `/tradelines/${input.tradelineId}?tab=compliance&reviewViolationId=${input.violationId}`,
    evidenceSummary,
  };
}
