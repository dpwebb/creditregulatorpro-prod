/**
 * Type definition for Canadian Credit Bureau dispute addresses.
 */
export type RegisteredMailAddress = {
  department: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
};

export type BureauDisputeAddress = {
  bureauName: string;
  department: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  fullFormattedAddress: string;
  phone: string;
  email: string | null;
  onlineDisputeUrl: string;
  registeredMailAddress: RegisteredMailAddress;
};

/**
 * Official Canadian credit bureau dispute mailing addresses.
 * These are used for generating formal dispute letters and providing contact info to users.
 *
 * Note on addresses:
 * - Regular mail fields: used for standard correspondence
 * - registeredMailAddress: used specifically for Canada Post Registered Mail dispatch via PostGrid
 *   (physical street address required; PO boxes cannot receive registered mail directly but
 *    Equifax's Box 190 in Montreal can receive registered mail via Canada Post delivery notice,
 *    so it is kept the same)
 */
export const BUREAU_DISPUTE_ADDRESSES: BureauDisputeAddress[] = [
  {
    bureauName: "Equifax Canada",
    department: "National Consumer Relations",
    addressLine1: "P.O. Box 190, Station Jean-Talon",
    city: "Montreal",
    province: "Quebec",
    postalCode: "H1S 2Z2",
    fullFormattedAddress: "National Consumer Relations, P.O. Box 190, Station Jean-Talon, Montreal, Quebec H1S 2Z2",
    phone: "1-800-465-7166",
    email: null,
    onlineDisputeUrl: "https://www.consumer.equifax.ca/dispute/",
    registeredMailAddress: {
      department: "National Consumer Relations",
      addressLine1: "P.O. Box 190, Station Jean-Talon",
      city: "Montreal",
      province: "Quebec",
      postalCode: "H1S 2Z2",
    },
  },
  {
    bureauName: "TransUnion Canada",
    department: "Consumer Relations Department",
    addressLine1: "P.O. Box 338, LCD1",
    city: "Hamilton",
    province: "Ontario",
    postalCode: "L8L 7W2",
    fullFormattedAddress: "Consumer Relations Department, P.O. Box 338, LCD1, Hamilton, Ontario L8L 7W2",
    phone: "1-800-663-9980",
    email: "customerservice@transunion.ca",
    onlineDisputeUrl: "https://www.transunion.ca/product/consumer-dispute",
    registeredMailAddress: {
      department: "Consumer Relations Centre",
      addressLine1: "3115 Harvester Road, Suite 201",
      city: "Burlington",
      province: "Ontario",
      postalCode: "L7N 3N8",
    },
  },
];

/**
 * Finds a bureau dispute address by name using a case-insensitive partial match.
 * @param bureauName The name of the bureau to search for (e.g., "Equifax" or "TransUnion")
 * @returns The matching BureauDisputeAddress or null if not found.
 */
export function getBureauDisputeAddress(bureauName: string): BureauDisputeAddress | null {
  if (!bureauName) return null;

  const normalizedSearch = bureauName.toLowerCase();
  return (
    BUREAU_DISPUTE_ADDRESSES.find((b) =>
      b.bureauName.toLowerCase().includes(normalizedSearch)
    ) || null
  );
}

/**
 * Returns the registered mail address for a bureau, formatted for PostGrid dispatch.
 * This uses the physical street address required for Canada Post Registered Mail.
 *
 * @param bureauName The name of the bureau to search for (e.g., "Equifax" or "TransUnion")
 * @returns An object formatted for PostGrid, or null if bureau not found.
 */
export function getBureauRegisteredMailAddress(
  bureauName: string
): {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceOrState: string;
  postalOrZip: string;
  countryCode: string;
} | null {
  const bureau = getBureauDisputeAddress(bureauName);
  if (!bureau) return null;

  const { registeredMailAddress } = bureau;
  return {
    name: bureau.bureauName,
    addressLine1: registeredMailAddress.addressLine1,
    addressLine2: `Attn: ${registeredMailAddress.department}`,
    city: registeredMailAddress.city,
    provinceOrState: registeredMailAddress.province,
    postalOrZip: registeredMailAddress.postalCode,
    countryCode: "CA",
  };
}

/**
 * Returns all official Canadian bureau dispute addresses.
 */
export function getAllBureauDisputeAddresses(): BureauDisputeAddress[] {
  return [...BUREAU_DISPUTE_ADDRESSES];
}

/**
 * Formats the bureau address for use in formal dispute letters with proper line breaks.
 * @param address The BureauDisputeAddress object to format.
 * @param useRegisteredAddress Whether to use the registeredMailAddress fields instead of the regular address.
 * @returns A multi-line string suitable for the recipient section of a letter.
 */
export function formatBureauAddressForLetter(
  address: BureauDisputeAddress,
  useRegisteredAddress = false
): string {
  if (useRegisteredAddress) {
    const reg = address.registeredMailAddress;
    return [
      address.bureauName,
      reg.department,
      reg.addressLine1,
      `${reg.city}, ${reg.province} ${reg.postalCode}`,
    ].join("\n");
  }

  return [
    address.bureauName,
    address.department,
    address.addressLine1,
    `${address.city}, ${address.province} ${address.postalCode}`,
  ].join("\n");
}

/**
 * Formats all contact methods for a bureau dispute into a single string.
 * @param address The BureauDisputeAddress object.
 * @returns A formatted string containing mail, phone, email (if available), and online URL.
 */
export function formatBureauDisputeContactInfo(address: BureauDisputeAddress): string {
  const parts = [
    `Mail:\n${formatBureauAddressForLetter(address)}`,
    `Phone: ${address.phone}`,
    `Online Dispute: ${address.onlineDisputeUrl}`,
  ];

  if (address.email) {
    parts.push(`Email: ${address.email}`);
  }

  return parts.join("\n\n");
}