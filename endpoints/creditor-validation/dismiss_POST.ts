import { schema, OutputType } from "./dismiss_POST.schema";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  handleEndpointError,
  BusinessRuleError,
} from "../../helpers/endpointErrorHandler";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Fetch test record joined with tradeline to verify ownership
    const currentTest = await db
      .selectFrom("creditorObligationTest")
      .leftJoin("tradeline", "tradeline.id", "creditorObligationTest.tradelineId")
      .selectAll("creditorObligationTest")
      .select("tradeline.userId")
      .where("creditorObligationTest.id", "=", input.violationId)
      .executeTakeFirst();

    if (!currentTest) {
      throw new BusinessRuleError("Violation not found", 404);
    }

    if (user.role !== "admin" && currentTest.userId !== user.id) {
      throw new BusinessRuleError("You are not authorized to modify this violation alert", 403);
    }

    const updatedTest = await db
      .updateTable("creditorObligationTest")
      .set({
        userStatus: input.status,
        userStatusReason: input.reason || null,
        userStatusUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where("id", "=", input.violationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(
      JSON.stringify({
        obligationTest: updatedTest,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}