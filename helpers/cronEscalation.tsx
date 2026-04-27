import { scanForEscalation, triggerEscalation } from "./autoEscalation";

export async function cronEscalation(): Promise<void> {
  console.log("Starting cronEscalation job...");
  try {
    const obligationsToEscalate = await scanForEscalation();

    const results = {
      scannedCount: obligationsToEscalate.length,
      triggeredCount: 0,
      errors: [] as { id: number; error: string }[],
    };

    for (const obligation of obligationsToEscalate) {
      try {
        await triggerEscalation(obligation.id);
        results.triggeredCount++;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error during escalation";
        console.error(
          `Failed to auto-escalate obligation instance ${obligation.id}:`,
          err
        );
        results.errors.push({
          id: obligation.id,
          error: errorMessage,
        });
      }
    }

    console.log("cronEscalation completed:", results);
  } catch (error) {
    console.error("cronEscalation failed:", error);
  }
}