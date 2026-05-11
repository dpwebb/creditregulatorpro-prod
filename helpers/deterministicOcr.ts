import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { assessTextQuality, type TextQualityAssessment } from "./pdfTextQualityChecker";
import { base64PayloadToBuffer } from "./reportBinaryUtils";

const execFileAsync = promisify(execFile);

export type DeterministicOcrSourceMethod = "ocr_text";
export type DeterministicOcrEngine = "tesseract-cli";
export type DeterministicOcrRenderer = "pdftoppm";

export interface DeterministicOcrPageProvenance {
  pageNumber: number;
  sourceMethod: DeterministicOcrSourceMethod;
  engine: DeterministicOcrEngine;
  renderer: DeterministicOcrRenderer;
  confidence: number | null;
  charCount: number;
  wordCount: number;
  textSnippet: string;
}

export interface DeterministicOcrDiagnostics {
  enabled: boolean;
  available: boolean;
  engine: DeterministicOcrEngine;
  renderer: DeterministicOcrRenderer;
  engineVersion: string | null;
  rendererVersion: string | null;
  reason: string | null;
}

export interface DeterministicOcrProvenance {
  sourceMethod: DeterministicOcrSourceMethod;
  engine: DeterministicOcrEngine;
  renderer: DeterministicOcrRenderer;
  engineVersion: string | null;
  rendererVersion: string | null;
  pageCount: number;
  overallConfidence: number | null;
  pages: DeterministicOcrPageProvenance[];
  quality: TextQualityAssessment;
  validation: {
    deterministic: true;
    qualityAccepted: boolean;
    minimumRules: string[];
  };
}

export type DeterministicOcrResult =
  | {
      status: "succeeded";
      text: string;
      quality: TextQualityAssessment;
      provenance: DeterministicOcrProvenance;
    }
  | {
      status: "unavailable" | "failed" | "low_quality";
      text?: string;
      quality?: TextQualityAssessment;
      diagnostics: DeterministicOcrDiagnostics;
    };

export interface DeterministicOcrProvider {
  extract(input: {
    bytesBase64: string;
    mimeType: string;
    documentSha256: string;
  }): Promise<DeterministicOcrResult>;
}

function snippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().split(/\s+/).slice(0, 25).join(" ");
}

async function commandVersion(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 10000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return String(stdout || stderr).split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

async function availability(): Promise<DeterministicOcrDiagnostics> {
  const enabled = process.env.CRP_DETERMINISTIC_OCR_ENABLED === "true";
  const engineVersion = enabled ? await commandVersion("tesseract", ["--version"]) : null;
  const rendererVersion = enabled ? await commandVersion("pdftoppm", ["-v"]) : null;
  const available = enabled && Boolean(engineVersion && rendererVersion);

  return {
    enabled,
    available,
    engine: "tesseract-cli",
    renderer: "pdftoppm",
    engineVersion,
    rendererVersion,
    reason: available
      ? null
      : !enabled
        ? "Deterministic OCR is disabled. Set CRP_DETERMINISTIC_OCR_ENABLED=true after installing tesseract and pdftoppm."
        : !engineVersion
          ? "tesseract CLI is not available on PATH."
          : "pdftoppm is not available on PATH.",
  };
}

function parseTesseractTsv(tsv: string): { confidence: number | null; wordCount: number } {
  const rows = tsv.split(/\r?\n/).filter(Boolean);
  const header = rows.shift()?.split("\t") ?? [];
  const confidenceIndex = header.indexOf("conf");
  const textIndex = header.indexOf("text");
  if (confidenceIndex === -1 || textIndex === -1) {
    return { confidence: null, wordCount: 0 };
  }

  const confidences: number[] = [];
  for (const row of rows) {
    const columns = row.split("\t");
    const text = columns[textIndex]?.trim();
    const confidence = Number(columns[confidenceIndex]);
    if (text && Number.isFinite(confidence) && confidence >= 0) {
      confidences.push(confidence / 100);
    }
  }

  if (confidences.length === 0) return { confidence: null, wordCount: 0 };
  const average = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return {
    confidence: Number(average.toFixed(4)),
    wordCount: confidences.length,
  };
}

async function run(command: string, args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 25 * 1024 * 1024,
  });
  return String(stdout);
}

export function createDeterministicCliOcrProvider(): DeterministicOcrProvider {
  return {
    async extract(input) {
      const diagnostics = await availability();
      if (input.mimeType !== "application/pdf") {
        return {
          status: "failed",
          diagnostics: {
            ...diagnostics,
            reason: "Deterministic OCR only accepts PDF input.",
          },
        };
      }
      if (!diagnostics.available) {
        return { status: "unavailable", diagnostics };
      }

      const workspace = await mkdtemp(join(tmpdir(), "crp-ocr-"));
      try {
        const pdfPath = join(workspace, `${input.documentSha256}.pdf`);
        await writeFile(pdfPath, base64PayloadToBuffer(input.bytesBase64));

        await run("pdftoppm", ["-png", "-r", "300", pdfPath, "page"], workspace);
        const imageFiles = (await readdir(workspace))
          .filter((file) => /^page-\d+\.png$/i.test(file))
          .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

        if (imageFiles.length === 0) {
          return {
            status: "failed",
            diagnostics: {
              ...diagnostics,
              reason: "pdftoppm produced no page images.",
            },
          };
        }

        const pages: DeterministicOcrPageProvenance[] = [];
        const pageTexts: string[] = [];
        for (const [index, imageFile] of imageFiles.entries()) {
          const imagePath = join(workspace, imageFile);
          const text = await run("tesseract", [imagePath, "stdout", "-l", "eng", "--psm", "6"], workspace);
          const tsv = await run("tesseract", [imagePath, "stdout", "-l", "eng", "--psm", "6", "tsv"], workspace);
          const parsed = parseTesseractTsv(tsv);
          const pageNumber = index + 1;
          const normalizedPageText = text.trim();
          pageTexts.push(normalizedPageText);
          pages.push({
            pageNumber,
            sourceMethod: "ocr_text",
            engine: "tesseract-cli",
            renderer: "pdftoppm",
            confidence: parsed.confidence,
            charCount: normalizedPageText.length,
            wordCount: parsed.wordCount,
            textSnippet: snippet(normalizedPageText),
          });
        }

        const text = pageTexts.join("\f");
        const quality = assessTextQuality(text);
        const confidenceValues = pages
          .map((page) => page.confidence)
          .filter((value): value is number => typeof value === "number");
        const overallConfidence =
          confidenceValues.length > 0
            ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(4))
            : null;

        const provenance: DeterministicOcrProvenance = {
          sourceMethod: "ocr_text",
          engine: "tesseract-cli",
          renderer: "pdftoppm",
          engineVersion: diagnostics.engineVersion,
          rendererVersion: diagnostics.rendererVersion,
          pageCount: pages.length,
          overallConfidence,
          pages,
          quality,
          validation: {
            deterministic: true,
            qualityAccepted: quality.isValid,
            minimumRules: [
              "pdf text extraction was insufficient",
              "OCR engine and renderer are deterministic command-line tools",
              "OCR text passed deterministic credit-report text quality checks",
            ],
          },
        };

        if (!quality.isValid) {
          return {
            status: "low_quality",
            text,
            quality,
            diagnostics: {
              ...diagnostics,
              reason: quality.invalidReason ?? "OCR text failed deterministic quality checks.",
            },
          };
        }

        return { status: "succeeded", text, quality, provenance };
      } catch (error) {
        return {
          status: "failed",
          diagnostics: {
            ...diagnostics,
            reason: error instanceof Error ? error.message : String(error),
          },
        };
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  };
}
