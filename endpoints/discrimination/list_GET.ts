import { schema, OutputType } from "./list_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const session = await getServerUserSession(request);
    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams.entries());
    
        // Parse query params using schema.
    // Here we construct the input object from search params.
    const input = schema.parse({
      tradelineId: searchParams.tradelineId ? Number(searchParams.tradelineId) : undefined,
      status: searchParams.status || undefined,
    });

    let query = db
      .selectFrom("discriminationClaim")
      .innerJoin("tradeline", "discriminationClaim.tradelineId", "tradeline.id")
      .leftJoin("creditor", "tradeline.creditorId", "creditor.id")
      .select([
        "discriminationClaim.id",
        "discriminationClaim.tradelineId",
        "discriminationClaim.obligationInstanceId",
        "discriminationClaim.packetId",
        "discriminationClaim.grounds",
        "discriminationClaim.description",
        "discriminationClaim.evidenceSummary",
        "discriminationClaim.allegedDiscriminationDate",
        "discriminationClaim.reportedDate",
        "discriminationClaim.resolvedDate",
        "discriminationClaim.resolution",
        "discriminationClaim.status",
        "discriminationClaim.region",
        "discriminationClaim.createdAt",
        
        // Tradeline details
        "tradeline.accountNumber as tradelineAccountNumber",
        "creditor.name as creditorName"
      ])
      .where("tradeline.userId", "=", session.user.id);

    if (input.tradelineId) {
      query = query.where("discriminationClaim.tradelineId", "=", input.tradelineId);
    }

    if (input.status) {
      query = query.where("discriminationClaim.status", "=", input.status);
    }

    const results = await query.execute();

    return new Response(JSON.stringify(results satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}