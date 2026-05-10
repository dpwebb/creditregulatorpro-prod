import { describe, expect, it } from "vitest";
import {
  buildDefaultLetterTemplatePatch,
  getDefaultLetterTemplates,
  hasLetterTemplateContent,
} from "../../helpers/defaultLetterTemplates";
import { validateTemplateSnapshot } from "../../helpers/letterTemplateLifecycle";
import { renderLetterTemplateText } from "../../helpers/letterTemplateQueries";

describe("default letter templates", () => {
  it("prepopulates every supported template key with publishable content", () => {
    const templates = getDefaultLetterTemplates();
    expect(templates).toHaveLength(56);

    const keys = new Set(templates.map((template) => `${template.category}:${template.templateKey}`));
    expect(keys.size).toBe(templates.length);

    const categoryCounts = templates.reduce<Record<string, number>>((counts, template) => {
      counts[template.category] = (counts[template.category] ?? 0) + 1;
      return counts;
    }, {});

    expect(categoryCounts).toEqual({
      bureau: 3,
      provincial: 13,
      violation_narrative: 40,
    });

    for (const template of templates) {
      expect(template.label).not.toEqual("");
      expect(template.subject).toEqual(expect.any(String));
      expect(template.introduction).toEqual(expect.any(String));
      expect(template.requestedAction).toEqual(expect.any(String));
      expect(template.statutoryGrounds).toEqual(expect.any(String));

      if (template.category === "bureau" || template.category === "provincial") {
        expect(template.statutoryGrounds).toContain("Relevant statutory text or authority excerpt");
      }

      if (template.category === "violation_narrative") {
        expect(template.subject).not.toContain("Compliance finding");
        expect(template.subject).toContain("Formal Dispute and Reinvestigation Request");
        expect(template.introduction).not.toMatch(/Treat this language|before final use/i);
        expect(template.statutoryGrounds).not.toMatch(/reviewer|Mapped statute or authority/i);
        expect(template.introduction).toContain("Disputed field/value:");
        expect(template.introduction).toContain("{{disputedField}}");
        expect(template.introduction).toContain("{{reportedValue}}");
        expect(template.introduction).toContain("{{specificIssue}}");
        expect(template.statutoryGrounds).toContain("Field-level application");
        expect(template.requestedAction).toContain("Requested correction by disputed field");
        expect(template.requestedAction).toContain("{{specificRemedy}}");
        expect(template.requestedAction.length).toBeLessThan(120);
        expect(template.requestedAction).not.toContain("this account may contain");
        expect(template.introduction).not.toContain("Evidence to compare");
      }

      if (template.category === "bureau" || template.category === "provincial") {
        expect(template.subject).toContain("Formal Dispute and Reinvestigation Request");
        expect(template.requestedAction).toContain("Requested correction by disputed field");
        expect(template.requestedAction).toContain("Delete or suppress");
      }

      const validation = validateTemplateSnapshot(
        {
          ...template,
          isActive: true,
        },
        "PUBLISH"
      );

      expect(validation.errors).toEqual([]);
      expect(validation.unknownPlaceholders).toEqual([]);
    }
  });

  it("uses concise field-value violation narratives with specific legal anchors", () => {
    const byKey = new Map(
      getDefaultLetterTemplates()
        .filter((template) => template.category === "violation_narrative")
        .map((template) => [template.templateKey, template])
    );

    expect(byKey.get("balance_calculation_violation")?.statutoryGrounds).toContain(
      "PIPEDA, Schedule 1, Principle 4.6"
    );
    expect(byKey.get("identity_theft_violation")?.statutoryGrounds).toContain(
      "PIPEDA, Schedule 1, Principle 4.3"
    );
    expect(byKey.get("response_mov_missing")?.statutoryGrounds).toContain(
      "PIPEDA, Schedule 1, Principle 4.10"
    );
    expect(byKey.get("balance_calculation_violation")?.introduction).toBe(
      "Disputed field/value: {{disputedField}} = {{reportedValue}}. Issue: {{specificIssue}}"
    );
    expect(byKey.get("identity_theft_violation")?.requestedAction).toBe(
      "Requested correction by disputed field: {{specificRemedy}}"
    );
  });

  it("renders default template placeholders before outgoing use", () => {
    const variables = {
      accountNumber: "123456789",
      bureauName: "Equifax Canada",
      creditorName: "Sample Bank",
      province: "Ontario",
      statutoryReference: "Ontario Consumer Reporting Act",
      creditReportReferenceNumber: "L121322",
      exactDisputedFields: "reported balance; account status",
      disputedField: "Reported Balance",
      reportedValue: "$1,250.00",
      expectedValue: "$0.00",
      specificIssue:
        "Reported Balance is reported as $1,250.00; expected/source-supported value is $0.00.",
      specificConcern:
        "Reported Balance is reported as $1,250.00; expected/source-supported value is $0.00.",
      specificRemedy:
        "Correct Reported Balance to $0.00. If that remedy cannot be completed from source records, delete or suppress the tradeline.",
      requiredRemedy:
        "Correct Reported Balance to $0.00. If that remedy cannot be completed from source records, delete or suppress the tradeline.",
      regulatoryBasis: "PIPEDA, Schedule 1, Principle 4.6",
      reportDate: "2026-04-16",
    };

    for (const template of getDefaultLetterTemplates()) {
      for (const value of [
        template.subject,
        template.introduction,
        template.statutoryGrounds,
        template.requestedAction,
        template.statutoryTimeframe,
        template.consumerStatementRight,
      ]) {
        if (!value) continue;
        const rendered = renderLetterTemplateText(value, variables);
        expect(rendered).not.toMatch(/{{|}}/);
      }
    }
  });

  it("fills blank rows without overwriting existing custom text", () => {
    const defaults = getDefaultLetterTemplates().find(
      (template) => template.category === "bureau" && template.templateKey === "equifax"
    );
    expect(defaults).toBeDefined();

    const blankExisting = {
      id: 1,
      category: "bureau",
      templateKey: "equifax",
      label: "Equifax",
      subject: null,
      introduction: null,
      statutoryGrounds: null,
      requestedAction: null,
      statutoryTimeframe: null,
      consumerStatementRight: null,
      certification: null,
      closing: null,
      fullBodyOverride: null,
      statutoryReference: null,
      sourceUrl: null,
      isActive: true,
      updatedAt: new Date(),
      updatedBy: null,
    } as any;

    expect(hasLetterTemplateContent(blankExisting)).toBe(false);
    expect(buildDefaultLetterTemplatePatch(blankExisting, defaults!)).toMatchObject({
      subject: defaults!.subject,
      introduction: defaults!.introduction,
      requestedAction: defaults!.requestedAction,
    });

    const customExisting = {
      ...blankExisting,
      introduction: "Custom admin language",
    };

    expect(hasLetterTemplateContent(customExisting)).toBe(true);
    expect(buildDefaultLetterTemplatePatch(customExisting, defaults!)).not.toMatchObject({
      introduction: defaults!.introduction,
    });

    expect(
      buildDefaultLetterTemplatePatch(customExisting, defaults!, { overwriteExisting: true })
    ).toMatchObject({
      introduction: defaults!.introduction,
      statutoryGrounds: defaults!.statutoryGrounds,
      requestedAction: defaults!.requestedAction,
    });
  });
});
