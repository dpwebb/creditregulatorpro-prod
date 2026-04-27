export const MOP_DESCRIPTIONS: Record<string, string> = {
  "0": "Too new to rate",
  "1": "Pays within 30 days",
  "2": "Pays in 30–60 days",
  "3": "Pays in 60–90 days",
  "4": "Pays in 90–120 days",
  "5": "120+ days overdue",
  "7": "Consolidation order",
  "8": "Repossession",
  "9": "Bad debt / collection",
  "X": "Unknown"
};

export const getMopDescription = (mop: string | null | undefined): string => {
  if (!mop) return "Unknown";
  return MOP_DESCRIPTIONS[mop.toUpperCase()] || mop;
};