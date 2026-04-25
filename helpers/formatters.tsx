import { format, formatDistanceToNow, isValid, parseISO } from "./dateUtils";

/**
 * Safely parses a date input into a Date object.
 * Handles strings (ISO or otherwise), Date objects, and null/undefined.
 */
function parseDateSafe(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const parsed = typeof date === "string" ? parseISO(date) : date;
  return isValid(parsed) ? parsed : null;
}

/**
 * Format date as "Jan 15, 2024"
 * @example formatDate("2024-01-15") -> "Jan 15, 2024"
 */
export function formatDate(date: string | Date | null | undefined): string {
  const d = parseDateSafe(date);
  if (!d) return "";
  // Use UTC timezone to prevent date-only values from shifting by local offset
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Format date with time as "Jan 15, 2024 at 3:30 PM"
 * @example formatDateTime("2024-01-15T15:30:00") -> "Jan 15, 2024 at 3:30 PM"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  const d = parseDateSafe(date);
  if (!d) return "";
  return format(d, "MMM d, yyyy 'at' h:mm a");
}

/**
 * Relative time like "2 hours ago", "yesterday", "3 days ago"
 * @example formatRelativeTime(new Date()) -> "less than a minute ago"
 */
export function formatRelativeTime(
  date: string | Date | null | undefined
): string {
  const d = parseDateSafe(date);
  if (!d) return "";
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Time only like "3:30 PM"
 * @example formatTime("2024-01-15T15:30:00") -> "3:30 PM"
 */
export function formatTime(date: string | Date | null | undefined): string {
  const d = parseDateSafe(date);
  if (!d) return "";
  return format(d, "h:mm a");
}

/**
 * Format as Canadian currency: "$1,234.56 CAD"
 * @example formatCurrency(1234.56) -> "$1,234.56 CAD"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
  return `${formatted} CAD`;
}

/**
 * Compact currency for large amounts: "$1.2K", "$1.2M"
 * @example formatCurrencyCompact(1200) -> "$1.2K"
 */
export function formatCurrencyCompact(
  amount: number | null | undefined
): string {
  if (amount === null || amount === undefined) return "";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

/**
 * Format with commas: "1,234,567"
 * @example formatNumber(1234567) -> "1,234,567"
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "";
  return new Intl.NumberFormat("en-CA").format(num);
}

/**
 * Percentage: "45.67%"
 * @param num The number to format (e.g., 45.67 for 45.67%)
 * @param decimals Number of decimal places
 * @example formatPercent(45.67) -> "45.67%"
 */
export function formatPercent(
  num: number | null | undefined,
  decimals: number = 2
): string {
  if (num === null || num === undefined) return "";
  // Intl.NumberFormat percent style expects 0.4567 for 45.67%
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num / 100);
}

/**
 * Format Canadian phone: "(416) 555-1234"
 * @example formatPhoneNumber("4165551234") -> "(416) 555-1234"
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = ("" + phone).replace(/\D/g, "");
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return "(" + match[1] + ") " + match[2] + "-" + match[3];
  }
  // Return original if it doesn't match standard 10 digits
  return phone;
}

/**
 * Truncate with ellipsis: "This is a long..."
 * @example truncate("Hello World", 5) -> "Hello..."
 */
export function truncate(
  text: string | null | undefined,
  maxLength: number
): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}