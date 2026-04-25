import { addDays, differenceInDays, isPast, formatDistanceToNow } from "./dateUtils";

/**
 * Calculates the response deadline based on CA policy.
 * CA Policy: 30 days for initial response, 15 days for follow-ups.
 *
 * @param challengeSentDate The date the challenge was sent
 * @param isFollowUp Whether this is a follow-up challenge (default: false)
 */
export const calculateDeadline = (
  challengeSentDate: Date | string,
  isFollowUp: boolean = false
) => {
  const startDate = new Date(challengeSentDate);
  const daysToAdd = isFollowUp ? 15 : 30;
  const deadline = addDays(startDate, daysToAdd);

  const now = new Date();
  // differenceInDays returns negative if the first date is before the second date (past)
  // But here we want days remaining.
  // If deadline is future: deadline > now -> positive
  // If deadline is past: deadline < now -> negative
  const daysUntilDeadline = differenceInDays(deadline, now);
  const isOverdue = isPast(deadline);

  return {
    deadline,
    daysUntilDeadline,
    isOverdue,
  };
};

export type UrgencyLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

/**
 * Determines the urgency level of a deadline.
 *
 * @param deadline The deadline date
 * @returns UrgencyLevel
 */
export const getDeadlineUrgency = (deadline: Date | string): UrgencyLevel => {
  const date = new Date(deadline);
  const now = new Date();
  const daysUntil = differenceInDays(date, now);

  if (isPast(date)) {
    return "CRITICAL"; // Already overdue
  }

  if (daysUntil <= 3) {
    return "CRITICAL"; // Due very soon
  }

  if (daysUntil <= 7) {
    return "HIGH"; // Due within a week
  }

  if (daysUntil <= 14) {
    return "MEDIUM"; // Due within two weeks
  }

  return "LOW"; // More than two weeks out
};

/**
 * Formats the deadline status into a human-readable string.
 *
 * @param deadline The deadline date
 * @returns string e.g. "Overdue by 2 days", "Due in 5 days", "Due today"
 */
export const formatDeadlineStatus = (deadline: Date | string): string => {
  const date = new Date(deadline);
  const now = new Date();
  const daysDiff = differenceInDays(date, now);

  if (daysDiff < 0) {
    return `Overdue by ${Math.abs(daysDiff)} day${Math.abs(daysDiff) === 1 ? "" : "s"}`;
  }

  if (daysDiff === 0) {
    return "Due today";
  }

  return `Due in ${daysDiff} day${daysDiff === 1 ? "" : "s"}`;
};

/**
 * Helper to get a color code (CSS variable or hex) based on urgency.
 * Useful for UI badges.
 */
export const getUrgencyColor = (urgency: UrgencyLevel): string => {
  switch (urgency) {
    case "CRITICAL":
      return "var(--destructive)"; // Usually red
    case "HIGH":
      return "var(--orange-500, #f97316)"; // Orange
    case "MEDIUM":
      return "var(--yellow-500, #eab308)"; // Yellow
    case "LOW":
      return "var(--green-500, #22c55e)"; // Green
    case "NONE":
    default:
      return "var(--muted-foreground)"; // Grey
  }
};
