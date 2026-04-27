import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { OutputType } from "./current_GET.schema";


export async function handle(request: Request) {
  try {
    // Authenticates user (must be logged in, no strict admin checking)
    await getServerUserSession(request);
    
    const version = await db.selectFrom('softwareVersion')
       .selectAll()
       .where('status', '=', 'released')
       .orderBy('releasedAt', 'desc')
       .executeTakeFirst();
       
    return new Response(JSON.stringify((version || null) satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}