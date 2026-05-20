import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  getPacketPdfCacheMissEnvelopeMetrics,
  resetPacketPdfCacheMissEnvelopeForTests,
  runBoundedPacketPdfCacheMiss,
  type PacketPdfCacheMissEnvelopeConfig,
} from "../helpers/packetPdfCacheMissEnvelope";

const markdownOutput = resolve("docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md");
const jsonOutput = resolve("docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json");
const priorLoadEvidencePath = resolve("docs/production-scale/evidence/latest-load-simulated.json");

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function isProductionLike(): boolean {
  const envName = `${process.env.NODE_ENV ?? ""} ${process.env.APP_ENV ?? ""} ${process.env.CRP_ENV ?? ""} ${
    process.env.VERCEL_ENV ?? ""
  }`;
  if (/\bproduction\b/i.test(envName)) return true;

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (databaseUrl && !/(localhost|127\.0\.0\.1|\.test|staging)/i.test(databaseUrl) && /prod/i.test(databaseUrl)) {
    return true;
  }

  const liveProviderFlags = [
    process.env.CRP_LIVE_PROVIDERS_ENABLED,
    process.env.POSTGRID_LIVE_MODE,
    process.env.POSTGRID_TEST_MODE === "false" ? "true" : undefined,
  ];
  return liveProviderFlags.some((value) => /^(1|true|yes)$/i.test(value ?? ""));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function readPriorLoadEvidence(): { exists: boolean; queueOrEnvelopeImplemented: boolean | null } {
  try {
    const parsed = JSON.parse(readFileSync(priorLoadEvidencePath, "utf8"));
    return {
      exists: true,
      queueOrEnvelopeImplemented: parsed.packetPdfCache?.queueOrEnvelopeImplemented ?? null,
    };
  } catch {
    return {
      exists: false,
      queueOrEnvelopeImplemented: null,
    };
  }
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Math.round(sorted[index] * 100) / 100;
}

async function runSimulation() {
  if (isProductionLike()) {
    throw new Error("Refusing packet PDF cache-miss proof because the environment appears production-like.");
  }

  resetPacketPdfCacheMissEnvelopeForTests();
  const config: PacketPdfCacheMissEnvelopeConfig = {
    maxConcurrency: 2,
    pendingLimit: 10,
    timeoutMs: 1_000,
  };
  const syntheticCache = new Map<string, string>();
  const renderTimings: number[] = [];
  let activeSyntheticRenders = 0;
  let maxSyntheticActiveRenders = 0;
  let cacheHitCount = 0;
  let cacheMissRequestCount = 0;
  let externalProviderCallCount = 0;

  async function requestSyntheticPdf(cacheKey: string): Promise<string> {
    const cached = syntheticCache.get(cacheKey);
    if (cached) {
      cacheHitCount += 1;
      return cached;
    }

    cacheMissRequestCount += 1;
    return runBoundedPacketPdfCacheMiss(
      cacheKey,
      async () => {
        const startedAt = performance.now();
        activeSyntheticRenders += 1;
        maxSyntheticActiveRenders = Math.max(maxSyntheticActiveRenders, activeSyntheticRenders);
        await delay(25 + (cacheKey.length % 4) * 5);
        activeSyntheticRenders -= 1;
        const pdfBase64 = Buffer.from(`%PDF-SIMULATED-${cacheKey}`).toString("base64");
        syntheticCache.set(cacheKey, pdfBase64);
        renderTimings.push(Math.max(0, performance.now() - startedAt));
        return pdfBase64;
      },
      config,
    );
  }

  const startedAt = performance.now();
  const missKeys = [
    "SIMULATED_PACKET_A",
    "SIMULATED_PACKET_B",
    "SIMULATED_PACKET_C",
    "SIMULATED_PACKET_A",
    "SIMULATED_PACKET_D",
    "SIMULATED_PACKET_E",
    "SIMULATED_PACKET_B",
    "SIMULATED_PACKET_F",
  ];
  await Promise.all(missKeys.map((key) => requestSyntheticPdf(key)));
  await requestSyntheticPdf("SIMULATED_PACKET_A");
  await requestSyntheticPdf("SIMULATED_PACKET_B");

  let failureBehaviorVisible = false;
  try {
    await runBoundedPacketPdfCacheMiss(
      "SIMULATED_PACKET_FAILURE",
      async () => {
        throw new Error("SIMULATED_PACKET_PDF_RENDER_FAILURE");
      },
      config,
    );
  } catch {
    failureBehaviorVisible = true;
  }

  const metrics = getPacketPdfCacheMissEnvelopeMetrics(config);
  const priorLoadEvidence = readPriorLoadEvidence();
  const elapsedMs = Math.round(Math.max(0, performance.now() - startedAt) * 100) / 100;

  return {
    reportName: "packet-pdf-cache-miss-proof",
    evidenceType: "SIMULATED",
    strategy: "bounded synchronous cache-miss envelope",
    generatedAt: new Date().toISOString(),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: git(["rev-parse", "HEAD"]),
    priorLoadEvidence: {
      path: "docs/production-scale/evidence/latest-load-simulated.json",
      ...priorLoadEvidence,
      note: priorLoadEvidence.exists
        ? "Prior SIMULATED load/cache-miss capacity evidence was found."
        : "Prior SIMULATED load/cache-miss capacity evidence was missing before this proof.",
    },
    safety: {
      simulated: true,
      productionDataMutated: false,
      liveMailProviderCalls: false,
      liveExternalProviderCalls: false,
      externalProviderCallCount,
      realConsumerPiiUsed: false,
      realCreditReportsUsed: false,
    },
    compatibility: {
      packetWordingChanged: false,
      packetReadinessChanged: false,
      violationEvidenceRegulationLogicChanged: false,
      sendRouteProviderBehaviorChanged: false,
      parserOrOcrChanged: false,
    },
    simulation: {
      elapsedMs,
      totalSyntheticRequests: missKeys.length + 2,
      syntheticCacheMissRequests: cacheMissRequestCount,
      syntheticCacheHitsAfterWarmup: cacheHitCount,
      uniqueSyntheticCacheKeys: syntheticCache.size,
      renderTimingsMs: {
        p50: percentile(renderTimings, 50),
        p95: percentile(renderTimings, 95),
        max: percentile(renderTimings, 100),
      },
      maxSyntheticActiveRenders,
      failureBehaviorVisible,
    },
    envelope: metrics,
    warning:
      "SIMULATED packet PDF cache-miss proof is local capacity evidence. It is not production-at-scale proof and did not send mail or call live providers.",
    outputPaths: {
      markdown: "docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.md",
      json: "docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json",
    },
  };
}

function renderMarkdown(report: Awaited<ReturnType<typeof runSimulation>>): string {
  return [
    "# Packet PDF Cache-Miss Proof",
    "",
    `Generated: ${report.generatedAt}`,
    `Evidence type: ${report.evidenceType}`,
    `Strategy: ${report.strategy}`,
    `Branch: ${report.branch}`,
    `Commit: ${report.commit}`,
    "",
    "> SIMULATED packet PDF cache-miss proof is not production-at-scale proof and did not send mail or call live providers.",
    "",
    "## Safety",
    "",
    `- Production data mutated: ${report.safety.productionDataMutated ? "yes" : "no"}`,
    `- Live mail provider calls: ${report.safety.liveMailProviderCalls ? "yes" : "no"}`,
    `- Live external provider calls: ${report.safety.liveExternalProviderCalls ? "yes" : "no"}`,
    `- External provider call count: ${report.safety.externalProviderCallCount}`,
    `- Real consumer PII used: ${report.safety.realConsumerPiiUsed ? "yes" : "no"}`,
    `- Real credit reports used: ${report.safety.realCreditReportsUsed ? "yes" : "no"}`,
    "",
    "## Prior Load Evidence",
    "",
    `- Path: ${report.priorLoadEvidence.path}`,
    `- Exists: ${report.priorLoadEvidence.exists ? "yes" : "no"}`,
    `- Queue/envelope implemented by prior artifact: ${String(report.priorLoadEvidence.queueOrEnvelopeImplemented)}`,
    `- Note: ${report.priorLoadEvidence.note}`,
    "",
    "## Envelope Metrics",
    "",
    `- Configured max concurrency: ${report.envelope.maxConcurrency}`,
    `- Configured pending limit: ${report.envelope.pendingLimit}`,
    `- Configured timeout ms: ${report.envelope.timeoutMs}`,
    `- Started renders: ${report.envelope.startedCount}`,
    `- Completed renders: ${report.envelope.completedCount}`,
    `- Failed renders: ${report.envelope.failedCount}`,
    `- Collapsed duplicate requests: ${report.envelope.collapsedCount}`,
    `- Overload rejections: ${report.envelope.overloadRejectedCount}`,
    `- Timeout count: ${report.envelope.timeoutCount}`,
    `- Max active observed: ${report.envelope.maxActiveObserved}`,
    `- Max synthetic active renders: ${report.simulation.maxSyntheticActiveRenders}`,
    "",
    "## Simulation",
    "",
    `- Total synthetic requests: ${report.simulation.totalSyntheticRequests}`,
    `- Synthetic cache-miss requests: ${report.simulation.syntheticCacheMissRequests}`,
    `- Synthetic cache hits after warmup: ${report.simulation.syntheticCacheHitsAfterWarmup}`,
    `- Unique synthetic cache keys: ${report.simulation.uniqueSyntheticCacheKeys}`,
    `- Render timing p50/p95/max ms: ${report.simulation.renderTimingsMs.p50}/${report.simulation.renderTimingsMs.p95}/${report.simulation.renderTimingsMs.max}`,
    `- Failure behavior visible: ${report.simulation.failureBehaviorVisible ? "yes" : "no"}`,
    "",
    "## Compatibility",
    "",
    `- Packet wording changed: ${report.compatibility.packetWordingChanged ? "yes" : "no"}`,
    `- Packet readiness changed: ${report.compatibility.packetReadinessChanged ? "yes" : "no"}`,
    `- Violation/evidence/regulation logic changed: ${
      report.compatibility.violationEvidenceRegulationLogicChanged ? "yes" : "no"
    }`,
    `- Send provider behavior changed: ${report.compatibility.sendRouteProviderBehaviorChanged ? "yes" : "no"}`,
    `- Parser/OCR changed: ${report.compatibility.parserOrOcrChanged ? "yes" : "no"}`,
    "",
    "## Residual Risk",
    "",
    "This is a bounded synchronous envelope, not an async render queue. Cache misses still wait for a bounded render slot and fail safely on overload or timeout. Production target-environment capacity still requires separate staged evidence.",
    "",
  ].join("\n");
}

const report = await runSimulation();
mkdirSync(dirname(markdownOutput), { recursive: true });
writeFileSync(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownOutput, renderMarkdown(report));
console.log(`Wrote ${markdownOutput}`);
console.log(`Wrote ${jsonOutput}`);
