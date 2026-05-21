import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildIngestUploadStatusView, type IngestUploadStatusJob } from "../helpers/ingestUploadStatusPresenter";

const evidenceDir = path.resolve("docs/production-scale/evidence");
const jsonPath = path.join(evidenceDir, "latest-ingest-stuck-99-regression.json");
const markdownPath = path.join(evidenceDir, "latest-ingest-stuck-99-regression.md");
const now = new Date();

function job(overrides: Partial<IngestUploadStatusJob>): IngestUploadStatusJob {
  return {
    id: 9901,
    status: "queued",
    reportArtifactId: 9901,
    userId: 990,
    runAfter: null,
    lockedUntil: null,
    updatedAt: now.toISOString(),
    lastErrorCode: null,
    ...overrides,
  };
}

const scenarios = [
  {
    name: "queued_waiting_for_worker",
    status: buildIngestUploadStatusView({
      artifactId: 9901,
      artifactProcessingStatus: "queued",
      job: job({ status: "queued" }),
      now,
    }),
  },
  {
    name: "processing_active",
    status: buildIngestUploadStatusView({
      artifactId: 9902,
      artifactProcessingStatus: "processing",
      job: job({ id: 9902, reportArtifactId: 9902, status: "running", lockedUntil: new Date(now.getTime() + 60_000).toISOString() }),
      now,
    }),
  },
  {
    name: "completed",
    status: buildIngestUploadStatusView({
      artifactId: 9903,
      artifactProcessingStatus: "completed",
      job: job({ id: 9903, reportArtifactId: 9903, status: "succeeded" }),
      now,
    }),
  },
  {
    name: "failed",
    status: buildIngestUploadStatusView({
      artifactId: 9904,
      artifactProcessingStatus: "failed",
      job: job({
        id: 9904,
        reportArtifactId: 9904,
        status: "failed",
        runAfter: new Date(now.getTime() + 120_000).toISOString(),
        lastErrorCode: "INGEST_PROCESSING_FAILED",
      }),
      now,
    }),
  },
  {
    name: "manual_review_required",
    status: buildIngestUploadStatusView({
      artifactId: 9905,
      artifactProcessingStatus: "failed",
      job: job({
        id: 9905,
        reportArtifactId: 9905,
        status: "dead_lettered",
        lastErrorCode: "INGEST_MANUAL_REVIEW_REQUIRED",
      }),
      now,
    }),
  },
  {
    name: "stale_processing",
    status: buildIngestUploadStatusView({
      artifactId: 9906,
      artifactProcessingStatus: "processing",
      job: job({
        id: 9906,
        reportArtifactId: 9906,
        status: "running",
        lockedUntil: new Date(now.getTime() - 60_000).toISOString(),
      }),
      now,
    }),
  },
];

const evidence = {
  generatedAt: now.toISOString(),
  command: "pnpm run ingest:stuck-99-regression",
  scope: "synthetic-local-status-regression",
  productionMutation: false,
  productionWorkerActivated: false,
  parserOcrViolationPacketBehaviorChanged: false,
  rawReportDataIncluded: false,
  statesCovered: scenarios.map((scenario) => scenario.name),
  scenarios,
};

const markdown = [
  "# Ingest Stuck-99 Regression Evidence",
  "",
  `Generated at: ${evidence.generatedAt}`,
  "",
  "- Scope: synthetic local status-regression evidence only.",
  "- Production mutation: false.",
  "- Production worker activated: false.",
  "- Parser/OCR/violation/packet behavior changed: false.",
  "- Raw report data included: false.",
  "",
  "| Scenario | UI status | Next action | Diagnostic code | Message |",
  "| --- | --- | --- | --- | --- |",
  ...scenarios.map((scenario) =>
    `| ${scenario.name} | ${scenario.status.status} | ${scenario.status.nextAction} | ${scenario.status.diagnosticCode} | ${scenario.status.userMessage} |`
  ),
].join("\n");

await mkdir(evidenceDir, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
await writeFile(markdownPath, `${markdown}\n`, "utf8");

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${jsonPath}`);
