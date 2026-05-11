import { describe, expect, it } from "vitest";

import {
  buildDeterministicHumanizedLetterTemplate,
  validateAiLetterTemplateRewrite,
} from "../../helpers/letterTemplateHumanizeAssist";
import type { LetterTemplateSnapshot } from "../../helpers/letterTemplateLifecycle";

function baseSnapshot(): LetterTemplateSnapshot {
  return {
    id: 10,
    category: "violation_narrative",
    templateKey: "balance_calculation_violation",
    label: "Balance Calculation Violation",
    isActive: true,
    subject: "Formal Dispute and Reinvestigation Request - Balance Calculation Violation",
    introduction:
      "Disputed field/value: {{disputedField}} = {{reportedValue}}. Issue: {{specificIssue}}",
    statutoryGrounds:
      'Statutory grounds relied on for this dispute:\n\n1. PIPEDA, Schedule 1, Principle 4.6. Relevant statutory text or authority excerpt: "Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used."',
    requestedAction:
      "Requested correction by disputed field: {{specificRemedy}} If unverifiable, delete, remove, or suppress the tradeline.",
    statutoryTimeframe: null,
    consumerStatementRight: null,
    certification: null,
    closing: null,
    fullBodyOverride: null,
    statutoryReference: "PIPEDA, Schedule 1",
    sourceUrl: null,
  };
}

describe("letter template humanize assist", () => {
  it("keeps statutory grounds and placeholders intact in deterministic fallback", () => {
    const snapshot = baseSnapshot();
    const humanized = buildDeterministicHumanizedLetterTemplate(snapshot);

    expect(humanized.statutoryGrounds).toBe(snapshot.statutoryGrounds);
    expect(humanized.introduction).toContain("{{disputedField}}");
    expect(humanized.introduction).toContain("{{reportedValue}}");
    expect(humanized.requestedAction).toContain("{{specificRemedy}}");
    expect(humanized.requestedAction).toMatch(/\b(delete|remove|suppress)\b/i);
  });

  it("adds removal fallback to legacy specific-remedy templates", () => {
    const snapshot = {
      ...baseSnapshot(),
      requestedAction: "Requested correction by disputed field: {{specificRemedy}}",
    };
    const humanized = buildDeterministicHumanizedLetterTemplate(snapshot);

    expect(humanized.requestedAction).toContain("{{specificRemedy}}");
    expect(humanized.requestedAction).toContain("If unverifiable");
  });

  it("accepts guarded AI template rewrites that preserve field-value and remedy placeholders", () => {
    const snapshot = baseSnapshot();
    const humanized = validateAiLetterTemplateRewrite(
      {
        introduction:
          "I am disputing this exact field/value: {{disputedField}} = {{reportedValue}}. The issue is: {{specificIssue}}",
        requestedAction:
          "Please make the specific correction requested here: {{specificRemedy}}. If the records do not verify that correction, delete, remove, or suppress the disputed information, item, or tradeline.",
      },
      snapshot
    );

    expect(humanized.introduction).toContain("{{specificIssue}}");
    expect(humanized.requestedAction).toContain("specific correction");
    expect(humanized.statutoryGrounds).toBe(snapshot.statutoryGrounds);
  });

  it("rejects AI rewrites that drop required placeholders", () => {
    expect(() =>
      validateAiLetterTemplateRewrite(
        {
          introduction: "I am disputing this account because the value is wrong.",
          requestedAction: "Please correct the account.",
        },
        baseSnapshot()
      )
    ).toThrow("ai_letter_template_placeholder_mismatch_introduction");
  });

  it("rejects AI rewrites that omit the removal fallback", () => {
    expect(() =>
      validateAiLetterTemplateRewrite(
        {
          introduction:
            "Disputed field/value: {{disputedField}} = {{reportedValue}}. Issue: {{specificIssue}}",
          requestedAction:
            "Please make the specific correction requested here: {{specificRemedy}}.",
        },
        baseSnapshot()
      )
    ).toThrow("ai_letter_template_missing_removal_fallback");
  });

  it("rejects AI rewrites that keep only the remedy placeholder without a correction request", () => {
    expect(() =>
      validateAiLetterTemplateRewrite(
        {
          introduction:
            "Disputed field/value: {{disputedField}} = {{reportedValue}}. Issue: {{specificIssue}}",
          requestedAction: "{{specificRemedy}}",
        },
        baseSnapshot()
      )
    ).toThrow("ai_letter_template_missing_disputed_field_correction");
  });
});
