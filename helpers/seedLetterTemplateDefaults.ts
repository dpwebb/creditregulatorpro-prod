import { db } from "./db";
import {
  buildDefaultLetterTemplatePatch,
  getDefaultLetterTemplates,
  type DefaultLetterTemplate,
} from "./defaultLetterTemplates";

export type LetterTemplateSeedResult = {
  ok: true;
  seeded: number;
  updated: number;
  total: number;
};

export type LetterTemplateSeedOptions = {
  overwriteExisting?: boolean;
};

function insertValues(defaults: DefaultLetterTemplate, updatedBy: number | null) {
  return {
    category: defaults.category,
    templateKey: defaults.templateKey,
    label: defaults.label,
    subject: defaults.subject,
    introduction: defaults.introduction,
    statutoryGrounds: defaults.statutoryGrounds,
    requestedAction: defaults.requestedAction,
    statutoryTimeframe: defaults.statutoryTimeframe,
    consumerStatementRight: defaults.consumerStatementRight,
    certification: defaults.certification,
    closing: defaults.closing,
    fullBodyOverride: defaults.fullBodyOverride,
    statutoryReference: defaults.statutoryReference,
    sourceUrl: defaults.sourceUrl,
    isActive: true,
    updatedBy,
  };
}

export async function seedLetterTemplateDefaults(
  updatedBy: number | null,
  options: LetterTemplateSeedOptions = {}
): Promise<LetterTemplateSeedResult> {
  const defaults = getDefaultLetterTemplates();
  let seeded = 0;
  let updated = 0;

  for (const templateDefaults of defaults) {
    const existing = await db
      .selectFrom("letterTemplate")
      .selectAll()
      .where("category", "=", templateDefaults.category)
      .where("templateKey", "=", templateDefaults.templateKey)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto("letterTemplate")
        .values(insertValues(templateDefaults, updatedBy))
        .execute();
      seeded += 1;
      continue;
    }

    const patch = options.overwriteExisting
      ? buildDefaultLetterTemplatePatch(existing, templateDefaults, { overwriteExisting: true })
      : buildDefaultLetterTemplatePatch(existing, templateDefaults);
    if (Object.keys(patch).length === 0) {
      continue;
    }

    await db
      .updateTable("letterTemplate")
      .set({
        ...patch,
        updatedBy,
        updatedAt: new Date(),
      })
      .where("id", "=", existing.id)
      .execute();
    updated += 1;
  }

  return {
    ok: true,
    seeded,
    updated,
    total: defaults.length,
  };
}
