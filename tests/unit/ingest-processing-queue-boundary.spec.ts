import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("ingest processing queue boundaries", () => {
  it("keeps the queue service out of parser, OCR, compliance, storage, packet, and endpoint cutover paths", () => {
    const service = source("helpers/ingestProcessingQueueService.ts");
    const schema = source("helpers/ingestProcessingQueueSchema.ts");
    const reportEndpoint = source("endpoints/ingest/report_POST.ts");
    const processEndpoint = source("endpoints/ingest/process_POST.ts");

    expect(service).not.toMatch(/from "\.\/ingestReportHandler"|from "\.\/ingestCorePipeline"|from "\.\/canonicalCreditReportExtractor"|from "\.\/pdfTextExtractor"|from "\.\/deterministicOcr"|from "\.\/complianceScanner"/);
    expect(service).not.toContain("executeIngestPipeline(");
    expect(service).not.toContain("extractCanonicalCreditReport(");
    expect(service).not.toContain("scanAndPersistViolations(");
    expect(service).not.toContain("cleanupFailedIngest(");
    expect(service).not.toContain("createReportArtifact(");
    expect(service).not.toContain("generatePacketContentPdfBase64");
    expect(schema).not.toContain("storage_url");

    expect(reportEndpoint).toContain("handleIngestSubmit");
    expect(reportEndpoint).not.toContain("enqueueIngestProcessingJob");
    expect(processEndpoint).toContain("handleIngestProcess");
    expect(processEndpoint).not.toContain("claimNextIngestProcessingJob");
  });

  it("documents the current request-bound pipeline path while queue execution remains deferred", () => {
    const handler = source("helpers/ingestReportHandler.tsx");
    const core = source("helpers/ingestCorePipeline.tsx");
    const service = source("helpers/ingestProcessingQueueService.ts");

    expect(handler).toContain("handleIngestProcess");
    expect(handler).toContain("executeIngestPipeline");
    expect(core).toContain("extractCanonicalCreditReport");
    expect(core).toContain("scanAndPersistViolations");

    expect(service).toContain("endpointCutoverEnabled: false");
    expect(service).toContain("parserOutputMutated: false");
    expect(service).toContain("ocrBehaviorMutated: false");
    expect(service).toContain("violationTruthMutated: false");
    expect(service).toContain("evidenceBindingMutated: false");
    expect(service).toContain("packetReadinessMutated: false");
  });
});
