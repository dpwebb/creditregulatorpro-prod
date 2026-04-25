import { db } from "./db";

/**
 * Checks whether a user has access to a deadline event.
 * Admins always have access.
 * Non-admins must own the linked resource (obligation_instance → tradeline or packet).
 *
 * Returns the deadline event if access is granted, or null if the event is not found.
 * Throws an error with a 403-appropriate message if access is denied.
 */
export async function getDeadlineEventWithOwnershipCheck(
  deadlineEventId: number,
  userId: number,
  isAdmin: boolean
): Promise<{ id: number; obligationInstanceId: number | null; packetId: number | null } | null> {
  const event = await db
    .selectFrom("deadlineEvent")
    .select(["id", "obligationInstanceId", "packetId"])
    .where("id", "=", deadlineEventId)
    .executeTakeFirst();

  if (!event) {
    return null;
  }

  // Admins can access any deadline event
  if (isAdmin) {
    return event;
  }

  // Non-admins: check ownership via linked resources
  if (event.obligationInstanceId !== null) {
    const match = await db
      .selectFrom("obligationInstance")
      .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
      .select("tradeline.userId")
      .where("obligationInstance.id", "=", event.obligationInstanceId)
      .executeTakeFirst();

    if (match && match.userId === userId) {
      return event;
    }

    throw new AccessDeniedError("You do not have access to this deadline event.");
  }

  if (event.packetId !== null) {
    const match = await db
      .selectFrom("packet")
      .select("userId")
      .where("id", "=", event.packetId)
      .executeTakeFirst();

    if (match && match.userId === userId) {
      return event;
    }

    throw new AccessDeniedError("You do not have access to this deadline event.");
  }

  // No linked resources — non-admins are denied
  throw new AccessDeniedError("You do not have access to this deadline event.");
}

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}