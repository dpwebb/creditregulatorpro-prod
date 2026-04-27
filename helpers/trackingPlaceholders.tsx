import { nanoid } from "nanoid";

/**
 * Type definition for a tracking placeholder string.
 * Format: TRK-[YYYYMMDD]-[RANDOM]
 */
export type TrackingPlaceholder = `TRK-${string}-${string}`;

/**
 * Generates a unique tracking placeholder ID.
 * This is used when a packet is generated but not yet mailed, allowing the system
 * to track the intent to mail before the actual Canada Post tracking number is available.
 *
 * Format: TRK-[YYYYMMDD]-[5-CHAR-ALPHANUMERIC]
 * Example: TRK-20231025-X7Z9P
 */
export function generateTrackingPlaceholder(): TrackingPlaceholder {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const randomSuffix = nanoid(5).toUpperCase();
  return `TRK-${dateStr}-${randomSuffix}`;
}

/**
 * Interface for mail instructions returned by the helper functions.
 */
export interface MailInstructions {
  title: string;
  serviceName: string;
  steps: string[];
  warning: string;
  jurisdictionNote?: string;
}

/**
 * Returns jurisdiction-specific instructions for sending via Canada Post Registered Mail.
 * Registered Mail is generally preferred for legal documents in Canada as it provides
 * proof of mailing and proof of delivery with signature.
 *
 * @param jurisdiction - The province code (e.g., 'ON', 'QC', 'BC')
 */
export function getRegisteredMailInstructions(
  jurisdiction: string
): MailInstructions {
  const isQuebec = jurisdiction.toUpperCase() === "QC";

  const baseSteps = [
    "Print the generated dispute letter and all attached evidence.",
    "Sign the letter in blue or black ink.",
    "Place documents in a standard envelope.",
    "Visit a Canada Post outlet.",
    "Request 'Registered Mail' service (Domestic).",
    "Ensure you request the 'Signature' option if it is not automatically included.",
    "Pay the postage and keep the receipt containing the 13-character tracking number (e.g., RW 123 456 789 CA).",
    "Log back into the system and update the packet with the actual tracking number.",
  ];

  const instructions: MailInstructions = {
    title: `Mailing Instructions for ${jurisdiction}`,
    serviceName: "Canada Post Registered Mail™",
    steps: baseSteps,
    warning:
      "CRITICAL: You must retain the official Canada Post receipt. It is your primary evidence that the dispute was sent on a specific date.",
  };

  if (isQuebec) {
    instructions.jurisdictionNote =
      "For Quebec (Consumer Protection Act / Credit Assessment Agents Act), Registered Mail is strictly recommended to establish a verifiable date of receipt for the 30-day response clock.";
  } else {
    instructions.jurisdictionNote =
      "Registered Mail provides legal proof of mailing and delivery, which is essential for enforcing statutory response timelines in this jurisdiction.";
  }

  return instructions;
}

/**
 * Returns instructions for Xpresspost (Certified equivalent) if speed is a priority,
 * though Registered Mail is the standard for legal notices.
 *
 * @param jurisdiction - The province code
 */
export function getCertifiedMailInstructions(
  jurisdiction: string
): MailInstructions {
  return {
    title: `Expedited Mailing Instructions for ${jurisdiction}`,
    serviceName: "Canada Post Xpresspost™",
    steps: [
      "Print the generated dispute letter and evidence.",
      "Sign the letter clearly.",
      "Visit a Canada Post outlet.",
      "Request 'Xpresspost' service for faster delivery.",
      "IMPORTANT: You MUST request the 'Signature' option (Signature Required) to prove receipt.",
      "Keep the customer receipt with the tracking number.",
      "Update the system with the tracking number immediately.",
    ],
    warning:
      "Without the 'Signature' option, Xpresspost only confirms delivery to a mailbox, not receipt by a person. This may be insufficient for legal proof in some disputes.",
    jurisdictionNote:
      "Use this option only if the statutory deadline is imminent and you need next-day or 2-day delivery.",
  };
}