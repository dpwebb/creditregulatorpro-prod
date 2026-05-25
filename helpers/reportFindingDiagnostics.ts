import {
  summarizeFindingPacketReadiness,
  type FindingReadinessInput,
} from "./findingReadinessSummary";

export type ReportDiagnosticFinding = FindingReadinessInput;

export type ReportFindingDiagnosticSummary = {
  reportId: number;
  artifactId: number;
  tradelineCount: number;
  violationCandidateCount: number;
  persistedFindingCount: number;
  packetReadyFindingCount: number;
  blockedFindingCount: number;
  blockerReasonCodes: string[];
  ingestionStatus: string;
  currentStep: string;
};

export function buildReportFindingDiagnosticSummary(input: {
  artifactId: number;
  reportId?: number | null;
  tradelineCount: number;
  violationCandidateCount?: number;
  findings: ReportDiagnosticFinding[];
  ingestionStatus?: string | null;
  currentStep?: string | null;
}): ReportFindingDiagnosticSummary {
  const readiness = input.findings.map((finding) => summarizeFindingPacketReadiness(finding));
  const packetReadyFindingCount = readiness.filter((item) => item.packetReady).length;
  const blockerReasonCodes = Array.from(
    new Set(readiness.flatMap((item) => (item.packetReady ? [] : item.blockerReasonCodes))),
  );

  return {
    reportId: input.reportId ?? input.artifactId,
    artifactId: input.artifactId,
    tradelineCount: input.tradelineCount,
    violationCandidateCount: input.violationCandidateCount ?? input.findings.length,
    persistedFindingCount: input.findings.length,
    packetReadyFindingCount,
    blockedFindingCount: Math.max(0, input.findings.length - packetReadyFindingCount),
    blockerReasonCodes,
    ingestionStatus: input.ingestionStatus || "unknown",
    currentStep: input.currentStep || input.ingestionStatus || "unknown",
  };
}
