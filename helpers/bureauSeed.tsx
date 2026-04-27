import { Kysely } from "kysely";
import { DB } from "./schema";

/**
 * Seeds the database with the two major Canadian credit bureaus.
 * Updates the bureau information if they already exist based on name and region.
 */
export async function seedBureaus(db: Kysely<DB>): Promise<void> {
  const bureaus = [
    {
      name: "Equifax Canada",
      region: "CA",
      address: "PO Box 190, Station Jean-Talon, Montréal QC H1S 2Z2",
      addressLine1: "National Consumer Relations",
      addressLine2: "P.O. Box 190, Station Jean-Talon",
      city: "Montreal",
      province: "Quebec",
      postalCode: "H1S 2Z2",
      contactPhone: "1-800-465-7166",
      contactEmail: null,
    },
    {
      name: "TransUnion Canada",
      region: "CA",
      address: "3115 Harvester Road, Suite 201, Burlington ON L7N 3N8",
      addressLine1: "Consumer Relations Centre",
      addressLine2: "3115 Harvester Road, Suite 201",
      city: "Burlington",
      province: "Ontario",
      postalCode: "L7N 3N8",
      contactPhone: "1-800-663-9980",
      contactEmail: null,
    },
  ];

  for (const bureau of bureaus) {
    await db
      .insertInto("bureau")
      .values(bureau)
      .onConflict((oc) =>
        oc.columns(["name", "region"]).doUpdateSet({
          address: (eb) => eb.ref("excluded.address"),
          addressLine1: (eb) => eb.ref("excluded.addressLine1"),
          addressLine2: (eb) => eb.ref("excluded.addressLine2"),
          city: (eb) => eb.ref("excluded.city"),
          province: (eb) => eb.ref("excluded.province"),
          postalCode: (eb) => eb.ref("excluded.postalCode"),
          contactPhone: (eb) => eb.ref("excluded.contactPhone"),
          contactEmail: (eb) => eb.ref("excluded.contactEmail"),
        })
      )
      .execute();
  }
}