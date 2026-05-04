import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import type { User } from "./User";

const isPrivilegedUser = (user: User): boolean => user.role === "admin";

export async function requireReportArtifactAccess(user: User, artifactId: number) {
  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["id", "userId"])
    .where("id", "=", artifactId)
    .executeTakeFirst();

  if (!artifact) {
    throw new BusinessRuleError("Report artifact not found", 404);
  }

  if (!isPrivilegedUser(user) && artifact.userId !== user.id) {
    throw new BusinessRuleError("Access denied", 403);
  }

  return artifact;
}

export async function requireTradelineAccess(user: User, tradelineId: number) {
  const tradeline = await db
    .selectFrom("tradeline")
    .select(["id", "userId"])
    .where("id", "=", tradelineId)
    .executeTakeFirst();

  if (!tradeline) {
    throw new BusinessRuleError("Tradeline not found", 404);
  }

  if (!isPrivilegedUser(user) && tradeline.userId !== user.id) {
    throw new BusinessRuleError("Access denied", 403);
  }

  return tradeline;
}
