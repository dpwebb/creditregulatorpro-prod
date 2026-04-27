import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  handleEndpointError,
  BusinessRuleError,
} from "../../helpers/endpointErrorHandler";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin") {
      throw new BusinessRuleError("Only administrators can view the full agency directory", 403);
    }

    const url = new URL(request.url);
    const input = schema.parse({
      province: url.searchParams.get("province") || undefined,
      search: url.searchParams.get("search") || undefined,
      status: url.searchParams.get("status") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      offset: url.searchParams.get("offset") || undefined,
    });

    let query = db.selectFrom("licensedCollectionAgency");

    if (input.province) {
      query = query.where("province", "=", input.province);
    }
    if (input.status) {
      query = query.where("licenseStatus", "=", input.status as any);
    }
    if (input.search) {
      query = query.where("agencyNameNormalized", "ilike", `%${input.search.toUpperCase()}%`);
    }

    const countResult = await query
      .select((eb) => eb.fn.countAll<string>().as("total"))
      .executeTakeFirstOrThrow();
      
    const total = parseInt(countResult.total, 10);

    const agencies = await query
      .selectAll()
      .orderBy("province", "asc")
      .orderBy("agencyNameNormalized", "asc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return new Response(
      JSON.stringify({ agencies, total } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}