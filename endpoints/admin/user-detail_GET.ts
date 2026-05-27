import { schema, OutputType } from "./user-detail_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { requireAdminUser } from "../../helpers/requireAdminUser";


export async function handle(request: Request) {
  try {
    // 1. Authorization Check
    await requireAdminUser(request);

    // 2. Parse Input
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const input = schema.parse(queryParams);

    // 3. Query User
    const userEntity = await db
      .selectFrom("users")
      .select([
        "id",
        "email",
        "displayName",
        "role",
        "emailVerified",
        "avatarUrl",
        "createdAt",
      ])
      .where("id", "=", input.userId)
      .executeTakeFirst();

    if (!userEntity) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Query Subscription
    const subscriptionEntity = await db
      .selectFrom("subscriptions")
      .select([
        "plan",
        "status",
        "trialStart",
        "trialEnd",
        "currentPeriodStart",
        "currentPeriodEnd",
        "priceCad",
        "stripeCustomerId",
      ])
      .where("userId", "=", input.userId)
      .executeTakeFirst();

    // 5. Query Tradelines
    const tradelinesRaw = await db
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .select([
        "tradeline.id",
        "tradeline.accountNumber",
        "creditor.name as linkedCreditorName",
        "tradeline.originalCreditorName",
        "tradeline.status",
        "bureau.name as bureauName",
        "tradeline.balance",
        "tradeline.openedDate",
        "tradeline.lastReportedDate",
      ])
      .where("tradeline.userId", "=", input.userId)
      .execute();

    const tradelines = tradelinesRaw.map(t => ({
      id: t.id,
      accountNumber: t.accountNumber,
      creditorName: t.linkedCreditorName || t.originalCreditorName || "Unknown Creditor",
      status: t.status,
      bureauName: t.bureauName,
      balance: t.balance,
      openedDate: t.openedDate,
      lastReportedDate: t.lastReportedDate,
    }));

    // 6. Query Packets
    const packets = await db
      .selectFrom("packet")
      .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .leftJoin("creditorObligationTest", "creditorObligationTest.id", "packet.creditorObligationTestId")
      .select([
        "packet.id",
        "packet.status",
        "packet.type",
        "packet.createdAt",
        "tradeline.accountNumber as tradelineAccountNumber",
        "creditor.name as creditorName",
        "tradeline.originalCreditorName",
        "packet.terminalLabel",
        "packet.deliveryMethod",
        "creditorObligationTest.violationCategory",
        "creditorObligationTest.obligationType",
      ])
      .where("packet.userId", "=", input.userId)
      .execute();

    // 7. Query Report Artifacts
    const reportArtifacts = await db
      .selectFrom("reportArtifact")
      .select([
        "id",
        "artifactType",
        "createdAt",
        "reportDate",
        "region",
      ])
      .where("userId", "=", input.userId)
      .execute();

    // 8. Query Recent Activity (Audit Logs)
    const recentActivity = await db
      .selectFrom("auditLog")
      .select([
        "id",
        "actionType",
        "entityType",
        "entityId",
        "timestamp",
        "status",
        "details",
      ])
      .where("userId", "=", input.userId)
      .orderBy("timestamp", "desc")
      .limit(20)
      .execute();

    // 9. Return Response
    return new Response(
      JSON.stringify({
        user: userEntity,
        subscription: subscriptionEntity || null,
        tradelines,
        packets,
        reportArtifacts,
        recentActivity,
      } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
