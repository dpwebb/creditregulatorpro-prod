import type { CanadianProvince } from "./schema";
import type { DisputeVectorType } from "./obligationVectors";
import { regulationRegistry } from "./regulationRegistry";

export type InfractionSeverity = "HIGH" | "MEDIUM" | "LOW";
export type InfractionType = "BUREAU_VIOLATION" | "CREDITOR_VIOLATION" | "COLLECTOR_VIOLATION";

export interface InfractionFinding {
  tradelineId: number | null;
  creditorId: number | null;
  accountNumber: string;
  creditorName: string;
  infractionType: InfractionType;
  violationCategory: string;
  severity: InfractionSeverity;
  fcraSection: string;
  description: string;
  evidenceDetails: string;
  suggestedDisputeVector: DisputeVectorType;
  autoChallengeable: boolean;
  regulationIds?: string[];
}

export interface ReportMetadata {
  reportDate: Date;
  region: string;
  userProvince?: CanadianProvince;
}

/**
 * Provincial limitation periods for debt collection in Canada
 */
export const PROVINCIAL_LIMITATION_PERIODS: Record<CanadianProvince, number> = regulationRegistry.COLLECTION_LIMITATION_PERIODS;