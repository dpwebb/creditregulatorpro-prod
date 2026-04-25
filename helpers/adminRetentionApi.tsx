import { z } from "zod";


// Schema for the retention enforcement request
export const retentionSchema = z.object({
  confirmDelete: z.boolean(),
});

export type RetentionInput = z.infer<typeof retentionSchema>;

export type RetentionResult = {
  success: boolean;
  deletedCount: number;
  details: {
    table: string;
    count: number;
  }[];
  message: string;
};

// Schema for retention stats
export type RetentionStats = {
  eligibleForDeletion: number;
  breakdown: {
    table: string;
    count: number;
  }[];
  lastRun: Date | null;
};

export const runRetentionEnforcement = async (
  data: RetentionInput
): Promise<RetentionResult> => {
  const response = await fetch("/_api/admin/retention", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    // Try to parse error message if available
    try {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to run retention enforcement");
    } catch (e) {
      if (e instanceof Error && e.message !== "Failed to run retention enforcement") {
        throw e;
      }
      throw new Error("Failed to run retention enforcement");
    }
  }

    // Response uses standard JSON.
  const text = await response.text();
  return JSON.parse(text);
};

export const getRetentionStats = async (): Promise<RetentionStats> => {
  const response = await fetch("/_api/admin/retention/stats", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    try {
      const errorData = JSON.parse(await response.text());
      throw new Error(errorData.error);
    } catch (e) {
      throw new Error("Failed to fetch retention stats");
    }
  }

  const text = await response.text();
  return JSON.parse(text);
};