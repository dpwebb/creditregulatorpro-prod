import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { ensureRegulationRegistrySchema } from "../../helpers/regulationRegistrySchema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ensureRegulationRegistrySchema();

    const url = new URL(request.url);
    const input = schema.parse({
      search: url.searchParams.get("search") || undefined,
      jurisdiction: url.searchParams.get("jurisdiction") || undefined,
      category: url.searchParams.get("category") || undefined,
      activeStatus: url.searchParams.get("activeStatus") || undefined,
      reviewStatus: url.searchParams.get("reviewStatus") || undefined,
      includeInactive: url.searchParams.get("includeInactive") || undefined,
    });

    let query = db.selectFrom("regulationRegistry").selectAll();

    if (input.jurisdiction) query = query.where("jurisdiction", "=", input.jurisdiction);
    if (input.category) query = query.where("regulationCategory", "=", input.category);
    if (input.activeStatus) query = query.where("activeStatus", "=", input.activeStatus);
    if (input.reviewStatus) query = query.where("reviewStatus", "=", input.reviewStatus);
    if (!input.includeInactive && !input.activeStatus) query = query.where("activeStatus", "=", "active");

    if (input.search) {
      const pattern = `%${input.search}%`;
      query = query.where((eb) =>
        eb.or([
          eb("regulationId", "ilike", pattern),
          eb("regulationTitle", "ilike", pattern),
          eb("shortTitle", "ilike", pattern),
          eb("sectionNumber", "ilike", pattern),
          eb("plainLanguageSummary", "ilike", pattern),
        ])
      );
    }

    const rows = await query
      .orderBy("jurisdiction", "asc")
      .orderBy("regulationCategory", "asc")
      .orderBy("regulationId", "asc")
      .orderBy("updateVersion", "desc")
      .limit(300)
      .execute();

    const mappings = await db
      .selectFrom("regulationViolationMapping")
      .select(["regulationId", "violationCategory"])
      .where("active", "=", true)
      .execute();

    const categoriesByRegulation = new Map<string, Set<string>>();
    for (const mapping of mappings) {
      const set = categoriesByRegulation.get(mapping.regulationId) ?? new Set<string>();
      set.add(mapping.violationCategory);
      categoriesByRegulation.set(mapping.regulationId, set);
    }

    const regulations = rows.map((row) => {
      const categories = Array.from(categoriesByRegulation.get(row.regulationId) ?? []).sort();
      return {
        ...row,
        tags: row.tags ?? [],
        mappingCount: categories.length,
        mappedViolationCategories: categories,
      };
    });

    return new Response(JSON.stringify({ regulations } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
