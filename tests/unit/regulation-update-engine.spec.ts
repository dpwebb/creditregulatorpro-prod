import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { schema as mappingSchema } from "../../endpoints/regulation-registry/mapping_POST.schema";
import {
  assessRegulationConfidence,
  buildRegulationDiff,
  classifyRegulationCandidate,
  hashRegulationText,
  isAuthoritativeSourceUrl,
  parserSafeNormalizeText,
  validateRegulationApprovalSafety,
  type RegulationDraft,
} from "../../helpers/regulationUpdateEngine";
import { scanForRegulatoryUpdates } from "../../helpers/regulatoryScanner";

const sourcedDraft: RegulationDraft = {
  regulationId: "ON_CRA_TEST_9_3_A",
  jurisdiction: "Ontario",
  authoritySource: "Ontario e-Laws",
  regulationTitle: "Ontario Consumer Reporting Act",
  sectionNumber: "9(3)(a)",
  subsection: null,
  shortTitle: "Accuracy",
  fullText:
    "A consumer reporting agency shall not include in a consumer report information unless it has taken reasonable steps to ensure accuracy and completeness from an authoritative source.",
  plainLanguageSummary:
    "Consumer reporting agencies must take reasonable source-backed steps before reporting information.",
  officialSourceUrl: "https://www.ontario.ca/laws/statute/90c33",
  publicationDate: "2025-01-01",
  effectiveDate: "2025-01-01",
  repealSupersededStatus: "current",
  regulationCategory: "record_accuracy",
  tags: ["accuracy", "consumer_reporting"],
  citationFormat: "R.S.O. 1990, c. C.33, s. 9(3)(a)",
  sourceDocumentUrl: "https://www.ontario.ca/laws/statute/90c33",
};

describe("regulation update engine safety controls", () => {
  it("normalizes and hashes source text deterministically", () => {
    const a = parserSafeNormalizeText("Information shall be accurate,\ncomplete, and up-to-date.");
    const b = parserSafeNormalizeText("information shall be accurate, complete, and up-to-date.");

    expect(a).toBe(b);
    expect(hashRegulationText(a)).toBe(hashRegulationText(b));
  });

  it("generates a human-readable wording diff without legal interpretation", () => {
    const diff = buildRegulationDiff(
      "information shall be accurate and complete",
      "information shall be accurate, complete, and up-to-date",
    );

    expect(diff.hasTextChange).toBe(true);
    expect(diff.summary).toContain("Wording changed");
    expect(diff.newSnippet).toContain("up-to-date");
  });

  it("classifies new, modified, repealed, and possible duplicate candidates", () => {
    expect(classifyRegulationCandidate({ candidate: sourcedDraft })).toBe("new");
    expect(classifyRegulationCandidate({ candidate: sourcedDraft, possibleDuplicateCount: 1 })).toBe("possible_duplicate");
    expect(
      classifyRegulationCandidate({
        candidate: { ...sourcedDraft, repealSupersededStatus: "repealed" },
      }),
    ).toBe("repealed");
    expect(
      classifyRegulationCandidate({
        candidate: { ...sourcedDraft, fullText: `${sourcedDraft.fullText} Added sentence.` },
        existing: {
          id: 1,
          regulationId: sourcedDraft.regulationId,
          regulationTitle: sourcedDraft.regulationTitle,
          sectionNumber: sourcedDraft.sectionNumber,
          subsection: null,
          fullText: sourcedDraft.fullText,
          parserSafeNormalizedText: parserSafeNormalizeText(sourcedDraft.fullText),
          updateVersion: 1,
          officialSourceUrl: sourcedDraft.officialSourceUrl,
        },
      }),
    ).toBe("modified");
  });

  it("blocks malformed, non-authoritative, AI, and source-scan placeholder approvals", () => {
    expect(isAuthoritativeSourceUrl("http://example.com/law")).toBe(false);
    expect(isAuthoritativeSourceUrl(sourcedDraft.officialSourceUrl)).toBe(true);

    expect(
      validateRegulationApprovalSafety({
        ...sourcedDraft,
        officialSourceUrl: "https://example.com/not-authoritative",
      }).errors,
    ).toContain("official source URL must be authoritative HTTPS source");

    expect(
      validateRegulationApprovalSafety({
        ...sourcedDraft,
        authoritySource: "ChatGPT generated summary",
      }).errors,
    ).toContain("AI or synthetic legal provenance cannot be approved as regulatory truth");

    expect(
      validateRegulationApprovalSafety({
        ...sourcedDraft,
        regulationId: "SOURCE_CHANGE_1_ABCDEF",
      }).errors,
    ).toContain("source-scan placeholders must be converted to canonical regulationIds before approval");
  });

  it("marks weakly sourced candidates as ambiguous before review", () => {
    const assessment = assessRegulationConfidence({
      ...sourcedDraft,
      officialSourceUrl: "https://example.com/not-authoritative",
      fullText: "short",
    });

    expect(assessment.confidenceScore).toBeLessThan(0.75);
    expect(assessment.ambiguityReasons.length).toBeGreaterThan(0);
    expect(
      classifyRegulationCandidate({
        candidate: {
          ...sourcedDraft,
          officialSourceUrl: "https://example.com/not-authoritative",
          fullText: "short",
        },
      }),
    ).toBe("ambiguous");
  });

  it("keeps legacy AI regulatory scans disabled", async () => {
    await expect(scanForRegulatoryUpdates([])).rejects.toThrow(/AI regulatory scanning is disabled/);
  });

  it("keeps legacy auto-escalation from applying statutes or active rules", () => {
    const source = readFileSync(
      join(process.cwd(), "endpoints", "regulatory-update", "auto-escalate_POST.ts"),
      "utf8",
    );

    expect(source).not.toContain('status: "APPLIED"');
    expect(source).not.toContain("insertInto(\"statute\")");
    expect(source).not.toContain("insertInto('statute')");
  });

  it("validates deterministic regulation-to-violation mapping input", () => {
    expect(
      mappingSchema.safeParse({
        violationCategory: "ACCOUNT_STATUS_INCONSISTENCY",
        regulationId: "ON_CRA_TEST_9_3_A",
        regulationRecordId: 1,
        sectionNumber: "9(3)(a)",
        subsection: null,
        jurisdiction: "Ontario",
        explanationTemplate: "Mapped accuracy authority for inconsistent account status.",
        active: true,
      }).success,
    ).toBe(true);
  });
});
