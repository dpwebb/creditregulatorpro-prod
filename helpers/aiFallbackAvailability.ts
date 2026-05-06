export const AI_FALLBACK_AVAILABLE = false;

export function resolveAiFallbackAvailability(
  requested: boolean | null | undefined,
  defaultWhenAvailable = true,
): boolean {
  if (!AI_FALLBACK_AVAILABLE) return false;
  return requested ?? defaultWhenAvailable;
}
