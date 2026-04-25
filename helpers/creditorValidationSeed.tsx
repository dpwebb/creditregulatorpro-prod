import { Kysely } from "kysely";
import { DB, CraObligationType } from "./schema";

/**
 * Seeds the creditor_validation_requirement table with default requirements for all existing creditors.
 * This ensures that every creditor in the system has a baseline set of Provincial CRA compliance checks.
 * 
 * @param db The Kysely database instance
 * @returns The number of new validation requirements created
 */
export async function seedCreditorValidations(db: Kysely<DB>): Promise<number> {
  // 1. Get all creditors
  const creditors = await db
    .selectFrom("creditor")
    .select(["id", "name"])
    .execute();

  if (creditors.length === 0) {
    console.log("No creditors found in database. Skipping validation requirement seeding.");
    return 0;
  }

  // 2. Define the standard Provincial CRA obligation types to seed
  const obligationTypes: CraObligationType[] = [
    "ACCURACY_INTEGRITY",
    "DISPUTE_INVESTIGATION",
    "CORRECTION_DUTY",
    "DOFD_REPORTING",
    "MONTHLY_REPORTING",
    "DATA_VALIDATION",
  ];

  // 3. Get existing requirements to avoid duplicates
  const existingRequirements = await db
    .selectFrom("creditorValidationRequirement")
    .select(["creditorId", "obligationType"])
    .execute();

  // Create a lookup set for efficient checking
  const existingSet = new Set(
    existingRequirements.map((r) => `${r.creditorId}-${r.obligationType}`)
  );

  let createdCount = 0;
  const insertValues: any[] = [];

  // 4. Prepare insert values for missing requirements
  for (const creditor of creditors) {
    for (const type of obligationTypes) {
      const key = `${creditor.id}-${type}`;
      
      if (!existingSet.has(key)) {
        insertValues.push({
          creditorId: creditor.id,
          obligationType: type,
          description: `${type.replace(/_/g, ' ')} Requirement`,
          validationStatus: "PENDING",
          notes: `Initial automated seed for ${creditor.name}`,
        });
      }
    }
  }

  // 5. Execute batch insert if there are new requirements
  if (insertValues.length > 0) {
    // Kysely handles batching. We use chunks if the list is extremely large, 
    // but for a seed script with standard creditor counts, a single insert is fine.
    await db
      .insertInto("creditorValidationRequirement")
      .values(insertValues)
      .execute();
    
    createdCount = insertValues.length;
  }

  console.log(`Seeded ${createdCount} creditor validation requirements.`);
  return createdCount;
}