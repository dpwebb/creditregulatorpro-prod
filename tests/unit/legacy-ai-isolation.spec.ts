import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  extractAmountsAsync,
  extractBalanceAsync,
  extractCreditLimitAsync,
  extractMopAsync,
} from "../../helpers/tradelineAmountExtractors";
import { extractHtmlWithFallbackChain, extractHtmlWithGemini, extractHtmlWithOpenAI } from "../../helpers/fallbackPdfExtractor";
import { gapFillTradelines } from "../../helpers/geminiGapFillExtractor";
import { extractTextWithGeminiOcr } from "../../helpers/geminiOcrExtractor";
import { parsePaymentGridWithGemini } from "../../helpers/geminiTableParser";
import {
  extractStructuredDataWithDocStrange,
  pollDocStrangeResult,
  submitDocStrangeExtraction,
} from "../../helpers/docstrangeLLM";
import { generateRuleFromUpdate } from "../../helpers/dynamicRuleGenerator";
import { resolveParserTestAllowAiFallback } from "../../helpers/parserTestProductionParser";
import { tradelineReparseSync } from "../../helpers/tradelineReparseSync";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("legacy AI and DocStrange isolation", () => {
  it("keeps parser-test execution deterministic even for legacy AI-enabled cases", () => {
    expect(resolveParserTestAllowAiFallback({ allowAiFallback: true })).toBe(false);
    expect(resolveParserTestAllowAiFallback({ parserMode: "ai_fallback_enabled" })).toBe(false);
  });

  it("keeps legacy DocStrange reparse hard-isolated as a no-op", async () => {
    await expect(tradelineReparseSync(123)).resolves.toEqual({ updated: 0, errors: [] });
  });

  it("does not let Metro2 compliance detection parse DocStrange artifacts", () => {
    const metro2 = source("helpers/complianceDetectorMetro2.tsx");

    expect(metro2).not.toContain("routeHtmlToLLMResponse");
    expect(metro2).not.toContain("docstrangeRawHtml");
    expect(metro2).not.toContain("docstrangeRawJson");
  });

  it("marks parser mapping tests as diagnostic-only and non-canonical", () => {
    const endpoint = source("endpoints/parser-mapping/test_POST.ts");
    const schema = source("endpoints/parser-mapping/test_POST.schema.ts");

    expect(endpoint).toContain("diagnosticOnly: true");
    expect(endpoint).toContain("authoritative: false");
    expect(endpoint).toContain("canonical: false");
    expect(schema).toContain("PARSER_MAPPING_DIAGNOSTIC");
  });

  it("keeps licensed-agency AI verification diagnostic-only", () => {
    const endpoint = source("endpoints/licensed-agency/ai-verify_POST.ts");

    expect(endpoint).not.toContain("importAgencies");
    expect(endpoint).not.toContain("dataSource: \"ai_verified\"");
    expect(endpoint).toContain("diagnosticOnly: true");
    expect(endpoint).toContain("authoritative: false");
  });

  it("keeps parser lab UI locked to deterministic mode", () => {
    const component = source("components/ParserLabStageTab.tsx");

    expect(component).toContain("Deterministic parser only");
    expect(component).not.toContain("onCheckedChange");
    expect(component).not.toContain("AI_FALLBACK_AVAILABLE");
  });

  it("keeps canonical extraction and ingest storage off legacy AI/DocStrange toggles", () => {
    const canonicalExtractor = source("helpers/canonicalCreditReportExtractor.tsx");
    const ingestCore = source("helpers/ingestCorePipeline.tsx");

    expect(canonicalExtractor).not.toContain("AI_FALLBACK_AVAILABLE");
    expect(canonicalExtractor).toContain("aiFallbackAvailable: false");
    expect(ingestCore).not.toContain("docstrangeRawHtml");
  });

  it("hard-isolates legacy AI and DocStrange network helpers", async () => {
    const docstrange = source("helpers/docstrangeLLM.tsx");
    const fallback = source("helpers/fallbackPdfExtractor.tsx");
    const geminiTable = source("helpers/geminiTableParser.tsx");
    const geminiOcr = source("helpers/geminiOcrExtractor.tsx");
    const gapFill = source("helpers/geminiGapFillExtractor.tsx");
    const unified = source("helpers/unifiedExtractor.tsx");
    const pdfText = source("helpers/pdfTextExtractor.tsx");
    const dynamicRuleGenerator = source("helpers/dynamicRuleGenerator.tsx");

    expect(docstrange).not.toContain("fetch(");
    expect(docstrange).not.toContain("DOCSTRANGE_API_KEY");
    expect(fallback).not.toContain("fetch(");
    expect(fallback).not.toContain("OPENAI_API_KEY");
    expect(fallback).not.toContain("GOOGLE_GEMINI");
    expect(geminiTable).not.toContain("fetch(");
    expect(geminiTable).not.toContain("process.env");
    expect(geminiOcr).not.toContain("fetch(");
    expect(geminiOcr).not.toContain("process.env");
    expect(gapFill).not.toContain("fetch(");
    expect(gapFill).not.toContain("GOOGLE_GEMINI");
    expect(unified).not.toContain("mapDocStrangeResponseToResult");
    expect(pdfText).not.toContain("extractTextWithGeminiOcr");
    expect(dynamicRuleGenerator).not.toContain("fetch(");
    expect(dynamicRuleGenerator).not.toContain("GOOGLE_GEMINI");

    await expect(parsePaymentGridWithGemini("Balance $123")).resolves.toBeNull();
    await expect(extractTextWithGeminiOcr("pdf")).resolves.toBe("");
    await expect(extractHtmlWithOpenAI("pdf")).resolves.toBeNull();
    await expect(extractHtmlWithGemini("pdf")).resolves.toBeNull();
    await expect(extractHtmlWithFallbackChain("pdf")).resolves.toBeNull();
    await expect(gapFillTradelines(1, [2])).resolves.toEqual({
      updated: 0,
      errors: ["AI tradeline gap-fill is disabled by deterministic ingestion policy."],
    });
    await expect(extractStructuredDataWithDocStrange("pdf")).resolves.toBeNull();
    await expect(pollDocStrangeResult("record")).resolves.toBeNull();
    await expect(submitDocStrangeExtraction("pdf")).resolves.toEqual({
      mode: "failed",
      error: "DocStrange extraction is disabled by deterministic ingestion policy.",
    });
    await expect(
      generateRuleFromUpdate({
        title: "Test",
        description: "Test",
        jurisdiction: "CA",
        changeType: "manual",
        statutoryReference: null,
        effectiveDate: null,
      }),
    ).rejects.toThrow("AI scanning rule generation is disabled");
  });

  it("keeps legacy async amount extractors deterministic", async () => {
    const text = [
      "Balance: $1,234",
      "High Credit: $5,000",
      "Past Due: $25",
      "Credit Limit: $7,500",
    ].join("\n");
    const amountExtractors = source("helpers/tradelineAmountExtractors.tsx");

    expect(amountExtractors).not.toContain("parsePaymentGridWithGemini");
    await expect(extractBalanceAsync(text)).resolves.toBe(1234);
    await expect(extractAmountsAsync(text)).resolves.toEqual({ high: 5000, pastDue: 25 });
    await expect(extractCreditLimitAsync(text)).resolves.toBe(7500);
    await expect(extractMopAsync(text)).resolves.toBeUndefined();
  });
});
