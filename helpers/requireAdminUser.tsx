import { BusinessRuleError } from "./endpointErrorHandler";
import { getServerUserSession } from "./getServerUserSession";

export async function requireAdminUser(
  request: Request,
): Promise<Awaited<ReturnType<typeof getServerUserSession>>> {
  const session = await getServerUserSession(request);

  if (session.user.role !== "admin") {
    throw new BusinessRuleError("Admin privileges required", 403);
  }

  return session;
}
