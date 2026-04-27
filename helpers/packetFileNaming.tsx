/**
 * Shared utility for building descriptive PDF filenames and GCS object names
 * for dispute packets.
 */

/**
 * Sanitizes a string for safe use in filenames (Content-Disposition header).
 * Removes characters that are unsafe across Windows, macOS, and Linux.
 */
export function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove unsafe filename characters
    .replace(/\s+/g, " ")                    // Collapse whitespace
    .trim()
    .substring(0, 80);                        // Cap segment length to avoid overly long names
}

/**
 * Sanitizes a string for safe use in stored document object names.
 * We avoid characters that cause URL/shell issues.
 */
export function sanitizeGcsSegment(value: string): string {
  return value
    .replace(/[#?[\]*]/g, "")               // Remove characters problematic in GCS/URLs
    .replace(/\s+/g, "_")                   // Replace whitespace with underscores
    .trim()
    .substring(0, 80);
}

/**
 * Formats a Date into YYYY-MM-DD_HHmm for use in filenames.
 */
export function formatDateTimeForFilename(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}

/**
 * Builds a descriptive Content-Disposition filename for a packet PDF.
 * Format: `{FullName} to {BureauName} - {CreditorName} - {YYYY-MM-DD HHmm}.pdf`
 */
export function buildPacketPdfFilename(
  consumerName: string,
  bureauName: string,
  creditorName: string,
  date: Date
): string {
  const safeConsumer = sanitizeFilenameSegment(consumerName) || "Consumer";
  const safeBureau = sanitizeFilenameSegment(bureauName) || "Bureau";
  const safeCreditor = sanitizeFilenameSegment(creditorName) || "Creditor";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd} ${hh}${min}`;

  return `${safeConsumer} to ${safeBureau} - ${safeCreditor} - ${dateStr}.pdf`;
}

/**
 * Builds a descriptive storage object name for a packet PDF.
 * Format: `packets/{packetId}_{FullName}_to_{BureauName}_{CreditorName}_{YYYY-MM-DD_HHmm}.pdf`
 * The packetId prefix ensures uniqueness; descriptive segments aid human readability.
 */
export function buildPacketStorageObjectName(
  packetId: number,
  consumerName: string,
  bureauName: string,
  creditorName: string,
  date: Date
): string {
  const safeConsumer = sanitizeGcsSegment(consumerName) || "Consumer";
  const safeBureau = sanitizeGcsSegment(bureauName) || "Bureau";
  const safeCreditor = sanitizeGcsSegment(creditorName) || "Creditor";
  const dateStr = formatDateTimeForFilename(date);

  return `packets/${packetId}_${safeConsumer}_to_${safeBureau}_${safeCreditor}_${dateStr}.pdf`;
}
