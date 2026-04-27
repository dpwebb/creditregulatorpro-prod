import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./snapshot_POST.schema";
import { buildCurrentSnapshot } from "../../helpers/versionSnapshotDiff";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    await db
      .selectFrom("softwareVersion")
      .select("id")
      .where("id", "=", input.versionId)
      .executeTakeFirstOrThrow();

    const systemSnapshot = await buildCurrentSnapshot();

    console.log(`Generating snapshot for version ${input.versionId}:`, {
      counts: systemSnapshot.counts,
      statutes: systemSnapshot.statutes.length,
      obligations: systemSnapshot.obligations.length,
      featureFlags: systemSnapshot.featureFlags.length,
      bureaus: systemSnapshot.bureaus.length,
      enforcementMechanisms: systemSnapshot.enforcementMechanisms.length,
      systemSettings: systemSnapshot.systemSettings.length,
      scanningRules: systemSnapshot.scanningRules.length,
      regulatoryUpdates: systemSnapshot.regulatoryUpdates.length,
    });

    const updated = await db
      .updateTable("softwareVersion")
      .set({
        systemSnapshot: JSON.parse(JSON.stringify(systemSnapshot)),
        updatedAt: new Date(),
        ...(input.codeLineCount !== undefined ? { codeLineCount: input.codeLineCount } : {}),
      })
      .where("id", "=", input.versionId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify(updated satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}