import { schema, OutputType } from "./settings_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { logAudit } from "../../helpers/auditLogger";


export async function handle(request: Request) {
  try {
    // Admin-only endpoint
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin") {
      console.warn(
        `Unauthorized admin settings modification attempt by user ${user.id} (role: ${user.role})`
      );
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    if (input.settings.length === 0) {
      return new Response(JSON.stringify([] satisfies OutputType));
    }

    const updatedRecords = await db.transaction().execute(async (trx) => {
      const results = [];

      for (const setting of input.settings) {
        const result = await trx
          .insertInto("systemSettings")
          .values({
            key: setting.key,
            value: setting.value,
            description: setting.description ?? null,
            updatedByUserId: user.id,
            updatedAt: new Date(),
          })
          .onConflict((oc) =>
            oc.column("key").doUpdateSet({
              value: (eb) => eb.ref("excluded.value"),
              description: (eb) => eb.ref("excluded.description"),
              updatedByUserId: (eb) => eb.ref("excluded.updatedByUserId"),
              updatedAt: (eb) => eb.ref("excluded.updatedAt"),
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow();

        results.push(result);
      }

      return results;
    });

    await logAudit({
      action: "SETTINGS_CHANGED",
      entityType: "SYSTEM",
      userId: user.id,
      details: { changedKeys: input.settings.map((s) => s.key) },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(updatedRecords satisfies OutputType));
  } catch (error) {
    console.error("Error updating system settings:", error);
    return handleEndpointError(error);
  }
}