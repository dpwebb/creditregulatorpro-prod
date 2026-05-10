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
        expect(template.introduction).not.toMatch(/Treat this language|before final use/i);
        expect(template.statutoryGrounds).not.toMatch(/reviewer|Mapped statute or authority/i);
        expect(template.requestedAction).toMatch(/^Please open a dispute investigation/i);
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

  it("renders default template placeholders before outgoing use", () => {
    const variables = {
      accountNumber: "123456789",
      bureauName: "Equifax Canada",
      creditorName: "Sample Bank",
      province: "Ontario",
      statutoryReference: "Ontario Consumer Reporting Act",
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
