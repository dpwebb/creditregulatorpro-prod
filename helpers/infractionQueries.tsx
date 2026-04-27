import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getReportArtifactList } from "../endpoints/report-artifact/list_GET.schema";
import { createCreditorValidation } from "../endpoints/creditor-validation/create_POST.schema";
import { InfractionFinding } from "./regulationInfractionScanner";
import { ParsedTradeline } from "./reportParser";
import { CraObligationType } from "./schema";
import { DisputeVectorType } from "./obligationVectors";

// --- Re-exports ---
export type { InfractionFinding } from "./regulationInfractionScanner";

// --- Types ---

export interface CreateChallengeInput {
  infractionFinding: InfractionFinding;
  tradelineId: number;
  creditorId: number;
  metro2Version?: string;
}

export interface BulkCreateChallengeInput {
  challenges: CreateChallengeInput[];
}

// --- Mappers ---

/**
 * Maps a DisputeVectorType (from infraction scanner) to CraObligationType (for DB schema).
 * This is a heuristic mapping as the domains slightly overlap but aren't 1:1.
 */
function mapVectorToObligationType(vector: DisputeVectorType): CraObligationType {
  switch (vector) {
    case "ACCURACY_ATTESTATION":
      return "ACCURACY_INTEGRITY";
    case "COMPLETENESS_ATTESTATION":
      return "DATA_VALIDATION";
    case "TIMING_COMPLIANCE":
      return "MONTHLY_REPORTING";
    case "AUTHORITY_TO_REPORT":
      return "DISPUTE_INVESTIGATION"; // Closest match for authority challenges
    case "VERIFICATION_METHOD":
      return "DATA_VALIDATION";
    default:
      return "ACCURACY_INTEGRITY"; // Default fallback
  }
}

// --- Hooks ---

/**
 * Fetches a specific report artifact and extracts its parsed tradelines if available.
 * Note: Since we don't have a specific GET by ID endpoint for artifacts yet,
 * we fetch the list and find the matching one. In a real app with pagination,
 * we would need a dedicated endpoint.
 */
export const useReportArtifactWithTradelines = (artifactId: number) => {
  const query = useQuery({
    queryKey: ["reportArtifacts", artifactId],
    queryFn: async () => {
      const response = await getReportArtifactList();
      const artifact = response.artifacts.find((a) => a.id === artifactId);
      
      if (!artifact) {
        throw new Error(`Artifact with ID ${artifactId} not found`);
      }

      // Safely extract tradelines from the JSON data column
      // The structure depends on how it was saved in the upload page
      const data = artifact.data as Record<string, any> | null;
      const tradelines = (data?.parsedTradelines as ParsedTradeline[]) || [];

      return {
        artifact,
        tradelines,
      };
    },
    enabled: !!artifactId,
  });

  return {
    artifact: query.data?.artifact,
    tradelines: query.data?.tradelines || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Mutation to create a single challenge from an infraction finding.
 */
export const useCreateChallengeFromInfraction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      infractionFinding,
      tradelineId,
      creditorId,
      metro2Version,
    }: CreateChallengeInput) => {
      const obligationType = mapVectorToObligationType(
        infractionFinding.suggestedDisputeVector
      );

      const notes = `[AUTO-GENERATED CHALLENGE]
Source: Infraction Scanner
Violation: ${infractionFinding.violationCategory} (${infractionFinding.fcraSection})
Description: ${infractionFinding.description}
Evidence: ${infractionFinding.evidenceDetails}`;

      return await createCreditorValidation({
        tradelineId,
        creditorId,
        obligationType,
        metro2Version,
        notes,
      });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["creditorValidations"] });
      queryClient.invalidateQueries({ queryKey: ["obligationChallenges"] });
    },
  });
};

/**
 * Mutation to create multiple challenges in sequence.
 * Useful for "Challenge All" functionality.
 */
export const useBulkCreateChallenges = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ challenges }: BulkCreateChallengeInput) => {
      const results = [];
      const errors = [];

      // Process sequentially to avoid overwhelming the server or hitting rate limits
      for (const challenge of challenges) {
        try {
          const obligationType = mapVectorToObligationType(
            challenge.infractionFinding.suggestedDisputeVector
          );

          const notes = `[BULK AUTO-CHALLENGE]
Source: Infraction Scanner
Violation: ${challenge.infractionFinding.violationCategory}
Evidence: ${challenge.infractionFinding.evidenceDetails}`;

          const result = await createCreditorValidation({
            tradelineId: challenge.tradelineId,
            creditorId: challenge.creditorId,
            obligationType,
            metro2Version: challenge.metro2Version,
            notes,
          });
          results.push(result);
        } catch (err) {
          console.error(
            `Failed to create challenge for tradeline ${challenge.tradelineId}:`,
            err
          );
          errors.push({
            tradelineId: challenge.tradelineId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return { results, errors };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditorValidations"] });
      queryClient.invalidateQueries({ queryKey: ["obligationChallenges"] });
    },
  });
};