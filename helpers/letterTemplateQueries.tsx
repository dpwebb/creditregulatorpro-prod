import { db } from "./db";
import { Insertable, Selectable, Updateable } from "kysely";
import { LetterTemplate, LetterTemplateCategory } from "./schema";
import { LetterContent } from "./pdfGenerator";

export type { LetterTemplateCategory };

export async function listLetterTemplates(category?: LetterTemplateCategory): Promise<Selectable<LetterTemplate>[]> {
  let query = db.selectFrom("letterTemplate").selectAll();
  if (category) {
    query = query.where("category", "=", category);
  }
  return await query.orderBy("category", "asc").orderBy("label", "asc").execute();
}

export async function getLetterTemplate(category: LetterTemplateCategory, templateKey: string): Promise<Selectable<LetterTemplate> | undefined> {
  return await db
    .selectFrom("letterTemplate")
    .selectAll()
    .where("category", "=", category)
    .where("templateKey", "=", templateKey)
    .executeTakeFirst();
}

export async function upsertLetterTemplate(
  data: Omit<Insertable<LetterTemplate>, "id" | "updatedAt"> & { id?: number }
): Promise<Selectable<LetterTemplate>> {
  const now = new Date();
  
  if (data.id) {
    return await db
      .updateTable("letterTemplate")
      .set({ ...data, updatedAt: now })
      .where("id", "=", data.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // Fallback to check by category + templateKey if ID is missing
  const existing = await getLetterTemplate(data.category, data.templateKey);
  
  if (existing) {
    return await db
      .updateTable("letterTemplate")
      .set({ ...data, updatedAt: now })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return await db
    .insertInto("letterTemplate")
    .values(data)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteLetterTemplate(id: number): Promise<void> {
  await db
    .updateTable("letterTemplate")
    .set({ isActive: false, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
}

export async function resolveTemplateOverrides(
  category: LetterTemplateCategory,
  templateKey: string
): Promise<Selectable<LetterTemplate> | null> {
  const template = await getLetterTemplate(category, templateKey);
  if (template && template.isActive) {
    return template;
  }
  return null;
}

export async function applyTemplateOverrides(
  letterContent: LetterContent,
  category: LetterTemplateCategory,
  templateKey: string
): Promise<LetterContent> {
  const overrides = await resolveTemplateOverrides(category, templateKey);
  if (!overrides) {
    return letterContent;
  }

  const merged: LetterContent = { ...letterContent };

  if (overrides.fullBodyOverride) {
    merged.introduction = overrides.fullBodyOverride;
    // Removing these sections if full body override is active
        merged.disputedItems = undefined as any;
    merged.statutoryGrounds = undefined as any;
    merged.requestedAction = undefined as any;
  } else {
    if (overrides.introduction) merged.introduction = overrides.introduction;
    if (overrides.statutoryGrounds) merged.statutoryGrounds = overrides.statutoryGrounds;
    if (overrides.requestedAction) merged.requestedAction = overrides.requestedAction;
  }

  if (overrides.subject) merged.subject = overrides.subject;
  if (overrides.statutoryTimeframe) merged.statutoryTimeframe = overrides.statutoryTimeframe;
  if (overrides.consumerStatementRight) merged.consumerStatementRight = overrides.consumerStatementRight;
  if (overrides.certification) merged.certification = overrides.certification;
  if (overrides.closing) merged.closing = overrides.closing;
  if (overrides.statutoryReference) merged.statutoryReference = overrides.statutoryReference;
  if (overrides.sourceUrl) merged.sourceUrl = overrides.sourceUrl;

  return merged;
}
