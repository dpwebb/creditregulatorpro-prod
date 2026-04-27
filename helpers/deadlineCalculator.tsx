import { db } from "./db";
import { DeadlineEvent } from "./schema";

export type CanadianProvince =
  | "ON"
  | "BC"
  | "AB"
  | "QC"
  | "SK"
  | "MB"
  | "NS"
  | "NB"
  | "PE"
  | "NL"
  | "YT"
  | "NT"
  | "NU";

export interface ProceduralWindow {
  initialResponseDays: number;
  followUpDays: number;
  maxInvestigationDays: number;
  escalationWindowDays: number;
}

const defaultProceduralWindow: ProceduralWindow = {
  initialResponseDays: 30,
  followUpDays: 15,
  maxInvestigationDays: 30,
  escalationWindowDays: 60,
};

export const PROVINCIAL_DEADLINES: Record<CanadianProvince, ProceduralWindow> = {
  ON: { ...defaultProceduralWindow },
  BC: { ...defaultProceduralWindow },
  AB: { ...defaultProceduralWindow },
  QC: { ...defaultProceduralWindow }, // Has additional French-language requirements but same basic timeline
  SK: { ...defaultProceduralWindow },
  MB: { ...defaultProceduralWindow },
  NS: { ...defaultProceduralWindow },
  NB: { ...defaultProceduralWindow },
  PE: { ...defaultProceduralWindow },
  NL: { ...defaultProceduralWindow },
  YT: { ...defaultProceduralWindow },
  NT: { ...defaultProceduralWindow },
  NU: { ...defaultProceduralWindow },
};

export const calculateProceduralWindow = (province: string): ProceduralWindow => {
  if (province in PROVINCIAL_DEADLINES) {
    return PROVINCIAL_DEADLINES[province as CanadianProvince];
  }
  return defaultProceduralWindow;
};

// Internal helper to calculate day difference natively
const diffInDays = (date1: Date, date2: Date) => {
  return Math.round((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Calculates the response deadline based on jurisdiction, context, and optional province.
 * CA Policy: 30 days for initial response, 15 days for follow-ups (by default, overridden by province).
 */
export const calculateDeadline = (
  challengeSentDate: Date,
  jurisdiction: string = "CA", // Default to CA as per policy
  isFollowUp: boolean = false,
  province?: string
) => {
  const windowInfo = province ? calculateProceduralWindow(province) : defaultProceduralWindow;
  const daysToAdd = isFollowUp ? windowInfo.followUpDays : windowInfo.initialResponseDays;
  
  // Native date math to add days
  const deadline = new Date(challengeSentDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  
  const now = new Date();
  const daysUntilDeadline = diffInDays(deadline, now);
  const isOverdue = deadline.getTime() < now.getTime();

  return {
    deadline,
    daysUntilDeadline,
    isOverdue,
  };
};

/**
 * Creates a deadline event record in the database.
 */
export const createDeadlineEvent = async (params: {
  obligationInstanceId?: number;
  packetId?: number;
  eventType: string;
  deadline: Date;
  title: string;
  description?: string;
  region?: string;
}) => {
  const {
    obligationInstanceId,
    packetId,
    eventType,
    deadline,
    title,
    description,
    region = "CA",
  } = params;

  const result = await db
    .insertInto("deadlineEvent")
    .values({
      obligationInstanceId: obligationInstanceId ?? null,
      packetId: packetId ?? null,
      eventType,
      deadline,
      title,
      description: description ?? null,
      region,
      isCompleted: false,
      createdAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return result;
};

/**
 * Retrieves upcoming deadlines for a user.
 * Filters for incomplete events where the deadline is in the future.
 */
export const getUpcomingDeadlines = async (userId: number | null, limit: number = 50) => {
  // We need to join with obligationInstance or packet to verify ownership via userId
  // Since deadlineEvent doesn't have userId directly, we infer it from the related entities.
  // When userId is null (admin), skip the userId filter to return all deadlines.
  
  const deadlines = await db
    .selectFrom("deadlineEvent")
    .leftJoin("obligationInstance", "deadlineEvent.obligationInstanceId", "obligationInstance.id")
    .leftJoin("packet", "deadlineEvent.packetId", "packet.id")
    .$if(userId !== null, (qb) =>
      qb.where((eb) =>
        eb.or([
          eb("obligationInstance.userId", "=", userId as number),
          eb("packet.userId", "=", userId as number),
        ])
      )
    )
    .where("deadlineEvent.isCompleted", "is not", true) // Handle null or false
    .where("deadlineEvent.deadline", ">", new Date())
    .select([
      "deadlineEvent.id",
      "deadlineEvent.title",
      "deadlineEvent.deadline",
      "deadlineEvent.eventType",
      "deadlineEvent.description",
      "deadlineEvent.obligationInstanceId",
      "deadlineEvent.packetId",
      "obligationInstance.tradelineId as obligationTradelineId",
      "packet.tradelineId as packetTradelineId",
    ])
    .orderBy("deadlineEvent.deadline", "asc")
    .limit(limit)
    .execute();

  return deadlines;
};

/**
 * Retrieves overdue deadlines for a user.
 * Filters for incomplete events where the deadline is in the past.
 */
export const getOverdueDeadlines = async (userId: number | null, limit: number = 50) => {
  const now = new Date();

  const deadlines = await db
    .selectFrom("deadlineEvent")
    .leftJoin("obligationInstance", "deadlineEvent.obligationInstanceId", "obligationInstance.id")
    .leftJoin("packet", "deadlineEvent.packetId", "packet.id")
    .$if(userId !== null, (qb) =>
      qb.where((eb) =>
        eb.or([
          eb("obligationInstance.userId", "=", userId as number),
          eb("packet.userId", "=", userId as number),
        ])
      )
    )
    .where("deadlineEvent.isCompleted", "is not", true)
    .where("deadlineEvent.deadline", "<", now)
    .select([
      "deadlineEvent.id",
      "deadlineEvent.title",
      "deadlineEvent.deadline",
      "deadlineEvent.eventType",
      "deadlineEvent.description",
      "deadlineEvent.obligationInstanceId",
      "deadlineEvent.packetId",
    ])
    .orderBy("deadlineEvent.deadline", "asc") // Most overdue first (oldest date)
    .limit(limit)
    .execute();

  // Add urgency scoring
  return deadlines.map((d) => {
    // Make sure we handle d.deadline properly as a Date object if needed
    const deadlineDate = new Date(d.deadline);
    const daysOverdue = diffInDays(now, deadlineDate);
    
    let urgency = "LOW";
    if (daysOverdue > 7) urgency = "MEDIUM";
    if (daysOverdue > 14) urgency = "HIGH";
    if (daysOverdue > 30) urgency = "CRITICAL";

    return {
      ...d,
      daysOverdue,
      urgency,
    };
  });
};

/**
 * Marks a deadline event as completed.
 */
export const markDeadlineCompleted = async (
  deadlineEventId: number,
  completedAt: Date = new Date()
) => {
  const result = await db
    .updateTable("deadlineEvent")
    .set({
      isCompleted: true,
      completedAt: completedAt,
    })
    .where("id", "=", deadlineEventId)
    .returningAll()
    .executeTakeFirst();

  return result;
};