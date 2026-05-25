export type AccountFindingVisibilityInput = {
  userStatus?: string | null;
  validationStatus?: string | null;
};

const REVIEW_ONLY_VALIDATION_STATUSES = new Set([
  "PARSER_UNCERTAIN",
  "NEEDS_PARSER_REVIEW",
  "NEEDS_USER_REVIEW",
]);

// Accounts summary display only. This must not become packet readiness,
// violation truth, or Problems/detail filtering.
export function isVisibleAccountFinding(input: AccountFindingVisibilityInput): boolean {
  const userStatus = (input.userStatus ?? "active").trim().toLowerCase();
  if (userStatus !== "active") return false;

  const validationStatus = (input.validationStatus ?? "PENDING").trim().toUpperCase();
  return !REVIEW_ONLY_VALIDATION_STATUSES.has(validationStatus);
}
