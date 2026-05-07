import { z } from "zod";
import type { LocalLegalAuthority, LegalAuthoritySupportLevel } from "../../helpers/legalAuthorityRegistry";

export const legalAuthoritySupportLevelSchema = z.enum([
  "field_requirement",
  "category_principle",
  "procedural_requirement",
  "reporting_standard",
  "registry_placeholder",
]);

export const schema = z.object({
  query: z.string().optional(),
  regulationId: z.string().optional(),
  violationCategory: z.string().optional(),
  fieldName: z.string().optional(),
  jurisdiction: z.string().optional(),
  supportLevel: legalAuthoritySupportLevelSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  authorities: LocalLegalAuthority[];
};

export const searchLegalAuthority = async (
  filters?: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.query) params.append("query", filters.query);
  if (filters?.regulationId) params.append("regulationId", filters.regulationId);
  if (filters?.violationCategory) params.append("violationCategory", filters.violationCategory);
  if (filters?.fieldName) params.append("fieldName", filters.fieldName);
  if (filters?.jurisdiction) params.append("jurisdiction", filters.jurisdiction);
  if (filters?.supportLevel) params.append("supportLevel", filters.supportLevel satisfies LegalAuthoritySupportLevel);
  if (filters?.limit) params.append("limit", String(filters.limit));

  const queryString = params.toString();
  const result = await fetch(`/_api/legal-authority/search${queryString ? `?${queryString}` : ""}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const text = await result.text();
    throw new Error(text || "Failed to search local legal authorities");
  }

  return JSON.parse(await result.text()) as OutputType;
};
