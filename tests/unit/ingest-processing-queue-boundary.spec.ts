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
    expect(processEndpoint).toContain("enqueueIngestProcessingJob");
    expect(processEndpoint).toContain("getLatestIngestProcessingJobByIdempotencyKey");
    expect(processEndpoint).toContain("handleIngestProcess");
    expect(processEndpoint).toContain("shouldAllowRequestBoundIngestProcessing");
    expect(processEndpoint).toContain("inlineGate.allowed");
    expect(processEndpoint).not.toContain("executeIngestPipeline");
    expect(processEndpoint).not.toContain("claimNextIngestProcessingJob");
  });

  it("documents worker-owned processing with request-bound processing gated to explicit local/test simulation", () => {
    const handler = source("helpers/ingestReportHandler.tsx");
    const core = source("helpers/ingestCorePipeline.tsx");
    const service = source("helpers/ingestProcessingQueueService.ts");
    const worker = source("scripts/ingest-processing-worker.ts");
    const reportEndpoint = source("endpoints/ingest/report_POST.ts");
    const processEndpoint = source("endpoints/ingest/process_POST.ts");

    expect(handler).toContain("handleIngestProcess");
    expect(handler).toContain("executeIngestPipeline");
    expect(core).toContain("extractCanonicalCreditReport");
    expect(core).toContain("scanAndPersistViolations");
    expect(worker).toContain("executeIngestPipeline");
    expect(worker).toContain("claimNextIngestProcessingJob");
    expect(worker).toContain("recordIngestProcessingWorkerHeartbeat");
    expect(worker).toContain("endpointCutoverEnabled: true");
    expect(reportEndpoint).not.toContain("enqueueIngestProcessingJob");
    expect(processEndpoint).toContain("enqueueIngestProcessingJob");
    expect(processEndpoint).toContain("claimIngestProcessingJobById");
    expect(processEndpoint).toContain("shouldAllowRequestBoundIngestProcessing");
    expect(processEndpoint).toContain("markIngestProcessingJobSucceeded");
    expect(processEndpoint).not.toContain("processNextIngestProcessingJob");
    expect(processEndpoint).not.toContain("executeIngestPipeline");

    expect(service).toContain("endpointCutoverEnabled: true");
    expect(service).toContain("parserOutputMutated: false");
    expect(service).toContain("ocrBehaviorMutated: false");
    expect(service).toContain("violationTruthMutated: false");
    expect(service).toContain("evidenceBindingMutated: false");
    expect(service).toContain("packetReadinessMutated: false");
  });

  it("proves deploy and compose wiring has a bounded ingest worker path", () => {
    const packageJson = JSON.parse(source("package.json"));
    const stagingCompose = source("docker-compose.yml");
    const productionCompose = source("docker-compose.production.yml");
    const stagingWorkflow = source(".github/workflows/deploy-staging.yml");
    const productionWorkflow = source(".github/workflows/deploy-production.yml");
    const evidenceScript = source("scripts/ingest-worker-boundary-evidence.ts");

    expect(packageJson.scripts["ingest:worker-boundary-evidence"]).toBe("tsx scripts/ingest-worker-boundary-evidence.ts");
    expect(stagingCompose).toContain("creditregulatorpro-staging-ingest-worker");
    expect(stagingCompose).toContain("--source authenticated_ingest_process");
    expect(stagingCompose).toContain("--concurrency 1");
    expect(productionCompose).toContain("creditregulatorpro-ingest-worker");
    expect(productionCompose).toContain("explicit-bounded-production-ingest-worker-apply");
    expect(productionCompose).toContain("--source authenticated_ingest_process");
    expect(productionCompose).toContain("--concurrency 1");
    expect(stagingWorkflow).toContain("pnpm run ingest:worker-boundary-evidence -- --preflight --no-write-evidence");
    expect(productionWorkflow).toContain("pnpm run ingest:worker-boundary-evidence -- --preflight --no-write-evidence");
    expect(stagingWorkflow).toContain("creditregulatorpro-staging creditregulatorpro-staging-ingest-worker");
    expect(productionWorkflow).toContain("creditregulatorpro creditregulatorpro-ingest-worker");
    expect(evidenceScript).toContain("latest-ingest-worker-boundary.md");
    expect(evidenceScript).toContain("latest-ingest-worker-boundary.json");
  });
});
