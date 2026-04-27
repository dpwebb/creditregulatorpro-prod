import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { OutputType } from "./list_GET.schema";


export async function handle(request: Request) {
  try {
    await getServerUserSession(request);
    
    const result = await db.selectFrom('featureFlag')
      .selectAll()
      .orderBy('key', 'asc')
      .execute();
      
    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}