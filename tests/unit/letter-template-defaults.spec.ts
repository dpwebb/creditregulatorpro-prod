import { describe, expect, it } from "vitest";
import {
  buildDefaultLetterTemplatePatch,
  getDefaultLetterTemplates,
  hasLetterTemplateContent,
} from "../../helpers/defaultLetterTemplates";
import { validateTemplateSnapshot } from "../../helpers/letterTemplateLifecycle";

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
