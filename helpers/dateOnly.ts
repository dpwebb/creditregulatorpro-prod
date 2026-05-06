function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Formats credit-report date-only values as YYYY-MM-DD without applying the
 * viewer's timezone. Parser outputs often arrive as ISO timestamps, but their
 * calendar date is the bureau-reported value.
 */
export function formatDateOnlyEnCa(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoDatePrefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if (isoDatePrefix) {
      return `${isoDatePrefix[1]}-${isoDatePrefix[2]}-${isoDatePrefix[3]}`;
    }

    const numericDate = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
    if (numericDate) {
      return `${numericDate[1]}-${padDatePart(Number(numericDate[2]))}-${padDatePart(Number(numericDate[3]))}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join("-");
}
