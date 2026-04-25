import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logCreate } from "../../helpers/auditLogger";
import { createDeadlineEvent } from "../../helpers/deadlineCalculator";
import { addDays, addYears } from "../../helpers/dateUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Validate bureau exists
    const bureau = await db
      .selectFrom("bureau")
      .select("id")
      .where("id", "=", input.bureauId)
      .executeTakeFirst();

    if (!bureau) {
      return new Response(JSON.stringify({ error: "Bureau not found" }), { status: 404 });
    }

    // Validate extended fraud alert requirements
    if (input.freezeType === "extended_fraud_alert") {
      if (!input.verificationDocuments || Object.keys(input.verificationDocuments).length === 0) {
        return new Response(JSON.stringify({ error: "Identity theft report is required for extended fraud alerts." }), { status: 400 });
      }
    }

    // Calculate expiration date
    const requestDate = new Date();
    let expirationDate: Date | null = null;

    if (input.freezeType === "fraud_alert") {
      expirationDate = addDays(requestDate, 90); 
    } else if (input.freezeType === "extended_fraud_alert") {
      expirationDate = addYears(requestDate, 7);
    } else if (input.freezeType === "security_freeze") {
      expirationDate = null;
    }

    // Create freeze record
    const newFreeze = await db
      .insertInto("identityTheftFreeze")
      .values({
        userId: user.id,
        bureauId: input.bureauId,
        freezeType: input.freezeType,
        status: "requested",
        requestDate: requestDate,
        expirationDate: expirationDate,
        notes: input.notes,
        verificationDocuments: input.verificationDocuments,
        region: "CA",
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create deadline event for follow-up
    await createDeadlineEvent({
      eventType: "FREEZE_CONFIRMATION",
      deadline: addDays(requestDate, 5),
      title: `Confirm ${input.freezeType.replace(/_/g, " ")} with Bureau`,
      description: `Verify that the ${input.freezeType} request sent on ${requestDate.toLocaleDateString()} has been processed.`,
      region: "CA",
    });

    // Log audit
    await logCreate(
      user.id,
      "USER_ACCOUNT",
      newFreeze.id,
      {
        freezeType: input.freezeType,
        bureauId: input.bureauId,
        expirationDate,
      },
      request
    );

    return new Response(JSON.stringify({ freeze: newFreeze } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}