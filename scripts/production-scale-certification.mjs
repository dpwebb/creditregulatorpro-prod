import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUTPUT_MARKDOWN = 'docs/production-scale/evidence/latest-production-scale-certification.md';
const OUTPUT_JSON = 'docs/production-scale/evidence/latest-production-scale-certification.json';
const DEFAULT_TARGET_ENVIRONMENT = 'production-scale-local-certification';
const STRICT_SHA_RE = /^[0-9a-f]{40}$/;
const EVIDENCE_CLOCK_SKEW_MS = 10_000;

export const REQUIRED_CERTIFICATION_GATES = [
  {
    id: 'contracts',
    label: 'Contract tests',
    command: 'pnpm run test:contracts',
  },
  {
    id: 'api',
    label: 'API tests',
    command: 'pnpm run test:api',
  },
  {
    id: 'authenticatedUploadResults',
    label: 'Authenticated consumer upload-to-results smoke',
    command: 'pnpm run smoke:auth-workflow',
  },
  {
    id: 'deterministicIngestion',
    label: 'Deterministic ingestion report',
    command: 'pnpm run test:deterministic-ingestion-report',
  },
  {
    id: 'responseSoak',
    label: 'Response soak check',
    command: 'pnpm run response:soak-check',
  },
  {
    id: 'packetPdfCacheMiss',
    label: 'Packet PDF cache-miss proof',
    command: 'pnpm run packet-pdf:cache-miss-proof',
    evidencePath: 'docs/production-scale/evidence/latest-packet-pdf-cache-miss-proof.json',
  },
  {
    id: 'migrationGovernance',
    label: 'Migration governance',
    command: 'pnpm run check:migrations',
  },
  {
    id: 'evidenceLedger',
    label: 'Evidence ledger append-only tests',
    command: 'pnpm run test:evidence-ledger',
  },
  {
    id: 'storageDurability',
    label: 'Storage durability simulation',
    command: 'pnpm run storage:durability-contract',
    evidencePath: 'docs/production-scale/evidence/latest-storage-durability.json',
  },
  {
    id: 'ingestWorkerLiveness',
    label: 'Ingest worker liveness simulation',
    command: 'pnpm run ingest:worker:simulated-proof',
    evidencePath: 'docs/production-scale/evidence/latest-ingest-worker-simulated.json',
  },
  {
    id: 'rollbackShaGovernance',
    label: 'Rollback SHA workflow static check',
    command: 'pnpm run deploy:rollback-sha-governance --write-evidence --json',
    evidencePath: 'docs/production-scale/evidence/latest-rollback-sha-governance.json',
  },
  {
    id: 'deployRollbackSimulation',
    label: 'Deploy rollback simulation',
    command: 'pnpm run deploy:rollback-simulation --write-evidence --json',
    evidencePath: 'docs/production-scale/evidence/latest-deploy-rollback-simulation.json',
  },
  {
    id: 'applicationCheck',
    label: 'Application check',
    command: 'pnpm run check',
  },
  {
    id: 'evidenceFreshness',
    label: 'Evidence freshness check',
    command: 'internal evidence freshness check',
    internal: true,
  },
];

function commandTail(buffer, chunk, maxLength = 6000) {
  const next = buffer + chunk.toString();
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

export function runShellCommand(command, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = new Date();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
    });

    child.stdout?.on('data', (chunk) => {
      stdout = commandTail(stdout, chunk);
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = commandTail(stderr, chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      const completedAt = new Date();
      resolve({
        command,
        exitCode: 1,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdout,
        stderr: commandTail(stderr, Buffer.from(error.message)),
      });
    });
    child.on('close', (code) => {
      const completedAt = new Date();
      resolve({
        command,
        exitCode: code ?? 1,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        stdout,
        stderr,
      });
    });
  });
}

function getGitValue(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function resolveEvidenceHead(evidence) {
  return evidence.currentHead
    ?? evidence.currentCommitHash
    ?? evidence.commit
    ?? evidence.head
    ?? null;
}

function isPassedEvidenceStatus(status) {
  if (typeof status !== 'string') {
    return true;
  }

  return ['passed', 'pass', 'ok', 'success', 'succeeded'].includes(status.toLowerCase());
}

export async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function evaluateEvidenceFreshness(options) {
  const {
    repoRoot,
    gates,
    targetSha,
    runStartedAt,
    completedAt,
    readJson = readJsonFile,
    clockSkewMs = EVIDENCE_CLOCK_SKEW_MS,
  } = options;

  const startedMs = new Date(runStartedAt).getTime();
  const completedMs = new Date(completedAt).getTime();
  const results = [];

  for (const gate of gates.filter((entry) => entry.evidencePath)) {
    const absolutePath = path.resolve(repoRoot, gate.evidencePath);
    const result = {
      gateId: gate.id,
      path: gate.evidencePath,
      status: 'passed',
      reasons: [],
    };

    try {
      const evidence = await readJson(absolutePath);
      const evidenceHead = resolveEvidenceHead(evidence);
      const evidenceTargetSha = typeof evidence.targetSha === 'string' ? evidence.targetSha : null;
      const generatedAt = evidence.generatedAt ?? evidence.timestamp ?? evidence.completedAt ?? null;
      const generatedMs = Date.parse(generatedAt);

      result.evidenceHead = evidenceHead;
      result.evidenceTargetSha = evidenceTargetSha;
      result.generatedAt = generatedAt;
      result.nestedStatus = evidence.status ?? null;
      result.nestedCERTIFYING = evidence.CERTIFYING ?? evidence.certifying ?? null;

      if (evidenceHead !== targetSha) {
        result.reasons.push(`evidence HEAD ${evidenceHead ?? 'missing'} does not match target SHA ${targetSha}`);
      }

      if (evidenceTargetSha && evidenceTargetSha !== targetSha) {
        result.reasons.push(`evidence target SHA ${evidenceTargetSha} does not match certification target ${targetSha}`);
      }

      if (!Number.isFinite(generatedMs)) {
        result.reasons.push('evidence timestamp is missing or invalid');
      } else if (generatedMs + clockSkewMs < startedMs) {
        result.reasons.push(`evidence timestamp ${generatedAt} is older than this certification run`);
      } else if (generatedMs - clockSkewMs > completedMs) {
        result.reasons.push(`evidence timestamp ${generatedAt} is after this certification run`);
      }

      if (!isPassedEvidenceStatus(evidence.status)) {
        result.reasons.push(`nested evidence status is ${evidence.status}`);
      }
    } catch (error) {
      result.reasons.push(`evidence JSON is missing or unreadable: ${error.message}`);
    }

    if (result.reasons.length > 0) {
      result.status = 'stale';
    }

    results.push(result);
  }

  return results;
}

function normalizeRequiredGateIds(gates, requiredGateIds) {
  if (Array.isArray(requiredGateIds) && requiredGateIds.length > 0) {
    return requiredGateIds;
  }

  return gates.map((gate) => gate.id);
}

function buildCommandList(gates) {
  return gates.map((gate) => gate.command ?? `missing command for ${gate.id}`);
}

function updateGateWithFreshness(gateResults, freshnessResults) {
  const byId = new Map(gateResults.map((gate) => [gate.id, gate]));

  for (const freshness of freshnessResults) {
    const gate = byId.get(freshness.gateId);
    if (!gate || freshness.status === 'passed') {
      continue;
    }

    if (gate.status === 'passed') {
      gate.status = 'stale';
    }
    gate.evidenceFreshness = freshness;
    gate.notes.push(...freshness.reasons);
  }

  return [...byId.values()];
}

function summarizeGateIds(gates, status) {
  return gates.filter((gate) => gate.status === status).map((gate) => gate.id);
}

export async function buildProductionScaleCertificationReport(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const gates = options.gates ?? REQUIRED_CERTIFICATION_GATES;
  const requiredGateIds = normalizeRequiredGateIds(gates, options.requiredGateIds);
  const runCommand = options.runCommand ?? runShellCommand;
  const runStartedAtDate = options.runStartedAt ? new Date(options.runStartedAt) : new Date();
  const currentHead = options.currentHead ?? getGitValue(['rev-parse', 'HEAD'], repoRoot);
  const currentBranch = options.currentBranch ?? getGitValue(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  const targetSha = options.targetSha ?? currentHead;
  const targetEnvironment = options.targetEnvironment ?? DEFAULT_TARGET_ENVIRONMENT;
  const gateResults = [];

  if (!STRICT_SHA_RE.test(targetSha)) {
    gateResults.push({
      id: 'targetShaValidation',
      label: 'Target SHA validation',
      command: 'internal target SHA validation',
      status: 'failed',
      startedAt: runStartedAtDate.toISOString(),
      completedAt: runStartedAtDate.toISOString(),
      durationMs: 0,
      exitCode: 1,
      notes: [`target SHA must be a strict 40-hex commit, received ${targetSha}`],
    });
  }

  const configuredGateIds = new Set(gates.map((gate) => gate.id));
  for (const requiredGateId of requiredGateIds) {
    if (!configuredGateIds.has(requiredGateId)) {
      gateResults.push({
        id: requiredGateId,
        label: requiredGateId,
        command: 'missing required gate',
        status: 'skipped',
        startedAt: runStartedAtDate.toISOString(),
        completedAt: runStartedAtDate.toISOString(),
        durationMs: 0,
        exitCode: null,
        notes: ['required gate is not configured'],
      });
    }
  }

  for (const gate of gates.filter((entry) => !entry.internal)) {
    if (gate.manualActionRequired) {
      gateResults.push({
        id: gate.id,
        label: gate.label,
        command: gate.command ?? 'manual-only gate',
        status: 'skipped',
        startedAt: runStartedAtDate.toISOString(),
        completedAt: runStartedAtDate.toISOString(),
        durationMs: 0,
        exitCode: null,
        evidencePath: gate.evidencePath ?? null,
        notes: ['gate requires human action and cannot certify automatically'],
      });
      continue;
    }

    if (!gate.command) {
      gateResults.push({
        id: gate.id,
        label: gate.label,
        command: 'missing command',
        status: 'skipped',
        startedAt: runStartedAtDate.toISOString(),
        completedAt: runStartedAtDate.toISOString(),
        durationMs: 0,
        exitCode: null,
        notes: ['gate has no automated command'],
      });
      continue;
    }

    if (options.logProgress) {
      console.log(`[production-scale:certify] running ${gate.id}: ${gate.command}`);
    }

    const commandResult = await runCommand(gate.command, { cwd: repoRoot, gate });
    gateResults.push({
      id: gate.id,
      label: gate.label,
      command: gate.command,
      status: commandResult.exitCode === 0 ? 'passed' : 'failed',
      startedAt: commandResult.startedAt,
      completedAt: commandResult.completedAt,
      durationMs: commandResult.durationMs,
      exitCode: commandResult.exitCode,
      evidencePath: gate.evidencePath ?? null,
      stdoutTail: commandResult.stdout ?? '',
      stderrTail: commandResult.stderr ?? '',
      notes: commandResult.exitCode === 0 ? [] : [`command exited with ${commandResult.exitCode}`],
    });
  }

  const completedAtDate = options.completedAt ? new Date(options.completedAt) : new Date();
  const evidenceFreshnessResults = await evaluateEvidenceFreshness({
    repoRoot,
    gates,
    targetSha,
    runStartedAt: runStartedAtDate.toISOString(),
    completedAt: completedAtDate.toISOString(),
    readJson: options.readJson,
    clockSkewMs: options.clockSkewMs,
  });

  const gateResultsWithFreshness = updateGateWithFreshness(gateResults, evidenceFreshnessResults);
  const staleEvidence = evidenceFreshnessResults.filter((entry) => entry.status !== 'passed');
  gateResultsWithFreshness.push({
    id: 'evidenceFreshness',
    label: 'Evidence freshness check',
    command: 'internal evidence freshness check',
    status: staleEvidence.length === 0 ? 'passed' : 'failed',
    startedAt: completedAtDate.toISOString(),
    completedAt: completedAtDate.toISOString(),
    durationMs: 0,
    exitCode: staleEvidence.length === 0 ? 0 : 1,
    evidenceFreshness: evidenceFreshnessResults,
    notes: staleEvidence.flatMap((entry) => entry.reasons.map((reason) => `${entry.gateId}: ${reason}`)),
  });

  const failedGates = summarizeGateIds(gateResultsWithFreshness, 'failed');
  const staleGates = [
    ...new Set([
      ...summarizeGateIds(gateResultsWithFreshness, 'stale'),
      ...staleEvidence.map((entry) => entry.gateId),
    ]),
  ];
  const skippedGates = summarizeGateIds(gateResultsWithFreshness, 'skipped');
  const certifying = failedGates.length === 0 && staleGates.length === 0 && skippedGates.length === 0;

  return {
    reportName: 'production-scale-certification',
    generatedAt: completedAtDate.toISOString(),
    runStartedAt: runStartedAtDate.toISOString(),
    runCompletedAt: completedAtDate.toISOString(),
    currentHead,
    currentCommitHash: currentHead,
    currentBranch,
    targetEnvironment,
    targetSha,
    commandList: buildCommandList(gates),
    exactCommandsRun: gateResultsWithFreshness.map((gate) => ({
      gateId: gate.id,
      command: gate.command,
      startedAt: gate.startedAt,
      completedAt: gate.completedAt,
      status: gate.status,
      exitCode: gate.exitCode,
      automated: true,
    })),
    gates: gateResultsWithFreshness,
    gateStatus: Object.fromEntries(gateResultsWithFreshness.map((gate) => [gate.id, gate.status])),
    evidenceFreshness: evidenceFreshnessResults,
    failedGates,
    staleGates,
    skippedGates,
    certifying,
    CERTIFYING: certifying,
    certificationRule: 'CERTIFYING:true only when every required automated gate passes and no gate is failed, stale, skipped, or manual-only.',
    liveExternalServicesRequired: false,
    liveDeploysRequired: false,
    manualTestingRequired: false,
    outputs: {
      markdown: OUTPUT_MARKDOWN,
      json: OUTPUT_JSON,
    },
  };
}

function markdownStatus(status) {
  return status === 'passed' ? 'PASS' : status.toUpperCase();
}

export function renderProductionScaleCertificationMarkdown(report) {
  const lines = [
    '# Production-Scale Certification Evidence',
    '',
    `Generated: ${report.generatedAt}`,
    `Current HEAD: \`${report.currentHead}\``,
    `Target SHA: \`${report.targetSha}\``,
    `Target environment: \`${report.targetEnvironment}\``,
    `CERTIFYING:${report.CERTIFYING ? 'true' : 'false'}`,
    '',
    '## Certification Rule',
    '',
    report.certificationRule,
    '',
    '## Gate Summary',
    '',
    '| Gate | Status | Command |',
    '| --- | --- | --- |',
  ];

  for (const gate of report.gates) {
    lines.push(`| ${gate.label ?? gate.id} | ${markdownStatus(gate.status)} | \`${gate.command}\` |`);
  }

  lines.push(
    '',
    '## Failed Gates',
    '',
    report.failedGates.length > 0 ? report.failedGates.map((gate) => `- ${gate}`).join('\n') : '- None',
    '',
    '## Stale Gates',
    '',
    report.staleGates.length > 0 ? report.staleGates.map((gate) => `- ${gate}`).join('\n') : '- None',
    '',
    '## Skipped Gates',
    '',
    report.skippedGates.length > 0 ? report.skippedGates.map((gate) => `- ${gate}`).join('\n') : '- None',
    '',
    '## Commands',
    '',
    ...report.commandList.map((command) => `- \`${command}\``),
    '',
    '## Output',
    '',
    `Machine-readable evidence: \`${OUTPUT_JSON}\``,
    '',
  );

  return `${lines.join('\n')}\n`;
}

export async function writeProductionScaleCertificationOutputs(report, repoRoot = process.cwd()) {
  const markdownPath = path.resolve(repoRoot, OUTPUT_MARKDOWN);
  const jsonPath = path.resolve(repoRoot, OUTPUT_JSON);
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderProductionScaleCertificationMarkdown(report), 'utf8');
  return { markdownPath, jsonPath };
}

export function parseProductionScaleCertificationArgs(argv) {
  const parsed = {
    targetSha: null,
    failOnNonCertifying: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target-sha') {
      parsed.targetSha = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith('--target-sha=')) {
      parsed.targetSha = arg.slice('--target-sha='.length);
    } else if (arg === '--no-fail-on-non-certifying') {
      parsed.failOnNonCertifying = false;
    } else if (arg === '--fail-on-non-certifying') {
      parsed.failOnNonCertifying = true;
    } else if (arg === '--json') {
      parsed.json = true;
    }
  }

  return parsed;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = parseProductionScaleCertificationArgs(process.argv.slice(2));
  const report = await buildProductionScaleCertificationReport({
    repoRoot,
    targetSha: args.targetSha ?? undefined,
    logProgress: true,
  });
  const outputs = await writeProductionScaleCertificationOutputs(report, repoRoot);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[production-scale:certify] wrote ${path.relative(repoRoot, outputs.markdownPath)}`);
    console.log(`[production-scale:certify] wrote ${path.relative(repoRoot, outputs.jsonPath)}`);
    console.log(`[production-scale:certify] CERTIFYING:${report.CERTIFYING ? 'true' : 'false'}`);
  }

  if (args.failOnNonCertifying && !report.CERTIFYING) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[production-scale:certify] ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}
