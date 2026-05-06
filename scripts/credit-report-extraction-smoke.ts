import { readFile } from "fs/promises";
import path from "path";
import { extractCanonicalCreditReport } from "../helpers/canonicalCreditReportExtractor";

type SmokeSummary = {
  file: string;
  selectedMethod: string;
  normalizedByAi: boolean;
  bureau: string | null;
  tradelineCount: number;
  confidenceScore: number;
  fieldCompleteness: unknown;
  issueCodes: string[];
  canonicalResultSha256: string;
  attempts: Array<{
    method: string;
    status: string;
    tradelineCount: number;
    confidenceScore: number | null;
    issueCodes: string[];
  }>;
};

function resolveProjectFixturePath(filePath: string): string {
  const projectRoot = process.cwd();
  const resolved = path.resolve(filePath);
  const rootPrefix = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;

  if (resolved !== projectRoot && !resolved.startsWith(rootPrefix)) {
    throw new Error(`Refusing to read fixture outside project root: ${filePath}`);
  }

  return resolved;
}

async function runForFile(filePath: string): Promise<SmokeSummary> {
  const resolvedPath = resolveProjectFixturePath(filePath);
  const bytes = await readFile(resolvedPath);
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  const extraction = await extractCanonicalCreditReport({
    bytesBase64: bytes.toString("base64"),
    mimeType: "application/pdf",
    allowAiFallback: false,
  }).finally(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });

  return {
    file: path.basename(resolvedPath),
    selectedMethod: extraction.provenance.selectedMethod,
    normalizedByAi: extraction.provenance.normalizedByAi,
    bureau: extraction.parseResult.sourceBureau?.bureauName ?? null,
    tradelineCount: extraction.parseResult.tradelines.length,
    confidenceScore: extraction.parserQuality.confidenceScore,
    fieldCompleteness: extraction.parserQuality.fieldCompleteness,
    issueCodes: extraction.parserQuality.issues.map((issue) => issue.code),
    canonicalResultSha256: extraction.provenance.canonicalResultSha256,
    attempts: extraction.provenance.attempts.map((attempt) => ({
      method: attempt.method,
      status: attempt.status,
      tradelineCount: attempt.tradelineCount,
      confidenceScore: attempt.confidenceScore,
      issueCodes: attempt.issueCodes,
    })),
  };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: pnpm exec tsx scripts/credit-report-extraction-smoke.ts <credit-report.pdf> [more.pdf]");
    process.exit(1);
  }

  const summaries: SmokeSummary[] = [];
  for (const file of files) {
    summaries.push(await runForFile(file));
  }

  console.log(JSON.stringify(summaries, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
