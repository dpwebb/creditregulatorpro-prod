export const CANADIAN_POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export interface PacketReadinessUserAccount {
  fullName?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export interface PacketReadinessBureau {
  name?: string | null;
  address?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export interface PacketReadinessResult {
  isReady: boolean;
  missingUserFields: string[];
  missingBureauInfo: boolean;
  bureauName: string | null;
}

export type PacketRecommendationPrimaryAction =
  | "CREATE_PACKET"
  | "COMPLETE_PROFILE"
  | "UPDATE_BUREAU_CONTACT";

export interface PacketRecommendationActionBlocker {
  code: "missing_user_profile" | "missing_bureau_contact";
  label: string;
  fields: string[];
}

export interface PacketRecommendationActionPlan {
  deterministic: true;
  ruleId: "packet-action-readiness-v1";
  primaryAction: PacketRecommendationPrimaryAction;
  status: "ready" | "blocked";
  ctaLabel: string;
  blockers: PacketRecommendationActionBlocker[];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function evaluatePacketReadiness(input: {
  userAccount: PacketReadinessUserAccount | null | undefined;
  bureau: PacketReadinessBureau | null | undefined;
}): PacketReadinessResult {
  const missingUserFields: string[] = [];

  if (!input.userAccount) {
    missingUserFields.push("fullName", "addressLine1", "city", "province", "postalCode");
  } else {
    if (!hasText(input.userAccount.fullName)) missingUserFields.push("fullName");
    if (!hasText(input.userAccount.addressLine1)) missingUserFields.push("addressLine1");
    if (!hasText(input.userAccount.city)) missingUserFields.push("city");
    if (!hasText(input.userAccount.province)) missingUserFields.push("province");

    const postalCode = input.userAccount.postalCode?.trim();
    if (!postalCode || !CANADIAN_POSTAL_CODE_REGEX.test(postalCode)) {
      missingUserFields.push("postalCode");
    }
  }

  const bureau = input.bureau;
  const bureauName = bureau?.name?.trim() || null;
  const hasFullAddressString = hasText(bureau?.address);
  const hasStructuredAddress =
    hasText(bureau?.addressLine1) &&
    hasText(bureau?.city) &&
    hasText(bureau?.province) &&
    hasText(bureau?.postalCode);
  const missingBureauInfo = !(hasFullAddressString || hasStructuredAddress);

  return {
    isReady: missingUserFields.length === 0 && !missingBureauInfo,
    missingUserFields,
    missingBureauInfo,
    bureauName,
  };
}

export function buildPacketRecommendationActionPlan(
  readiness: PacketReadinessResult,
): PacketRecommendationActionPlan {
  const blockers: PacketRecommendationActionBlocker[] = [];

  if (readiness.missingUserFields.length > 0) {
    blockers.push({
      code: "missing_user_profile",
      label: "Complete your profile before creating the letter.",
      fields: [...readiness.missingUserFields],
    });
  }

  if (readiness.missingBureauInfo) {
    blockers.push({
      code: "missing_bureau_contact",
      label: `${readiness.bureauName || "The bureau"} needs a mailing address before a letter can be generated.`,
      fields: ["bureauAddress"],
    });
  }

  let primaryAction: PacketRecommendationPrimaryAction = "CREATE_PACKET";
  if (blockers.some((blocker) => blocker.code === "missing_user_profile")) {
    primaryAction = "COMPLETE_PROFILE";
  } else if (blockers.some((blocker) => blocker.code === "missing_bureau_contact")) {
    primaryAction = "UPDATE_BUREAU_CONTACT";
  }

  return {
    deterministic: true,
    ruleId: "packet-action-readiness-v1",
    primaryAction,
    status: blockers.length === 0 ? "ready" : "blocked",
    ctaLabel:
      primaryAction === "CREATE_PACKET"
        ? "Challenge This Account"
        : primaryAction === "COMPLETE_PROFILE"
          ? "Complete Profile"
          : "Bureau Contact Needed",
    blockers,
  };
}
