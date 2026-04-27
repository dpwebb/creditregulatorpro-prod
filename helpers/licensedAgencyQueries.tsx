import { db } from "./db";
import { AgencyDataSource, LicenseStatus } from "./schema";

export const normalizeAgencyNameForDb = (name: string): string => {
  if (!name) return "";
  return name
    .toUpperCase()
    .replace(/[.,'"]/g, "") // Remove common punctuation
    .replace(/\s+/g, " ")   // Normalize spaces
    .trim();
};

export const findLicensedAgency = async (
  name: string,
  province: string
) => {
  const normalized = normalizeAgencyNameForDb(name);
  if (!normalized || !province) return null;

  return await db
    .selectFrom("licensedCollectionAgency")
    .selectAll()
    .where("agencyNameNormalized", "=", normalized)
    .where("province", "=", province)
    .executeTakeFirst();
};

export interface ImportAgencyInput {
  agencyName: string;
  province: string;
  licenseNumber?: string | null;
  licenseStatus?: string;
  dataSource: AgencyDataSource;
}

export const importAgencies = async (
  agencies: ImportAgencyInput[]
) => {
  const results = { imported: 0, skipped: 0 };
  if (agencies.length === 0) return results;

  // Group by province for efficient DB lookups
  const byProvince = agencies.reduce((acc, agency) => {
    if (!acc[agency.province]) acc[agency.province] = [];
    acc[agency.province].push(agency);
    return acc;
  }, {} as Record<string, ImportAgencyInput[]>);

  for (const [province, provAgencies] of Object.entries(byProvince)) {
    // Fetch all existing agencies for this province
    const existing = await db
      .selectFrom("licensedCollectionAgency")
      .where("province", "=", province)
      .select(["id", "agencyNameNormalized"])
      .execute();

    const existingMap = new Map<string, number>(
      existing.map((e) => [e.agencyNameNormalized, e.id])
    );

    const toInsert = [];

    for (const agency of provAgencies) {
      const normalized = normalizeAgencyNameForDb(agency.agencyName);
      if (!normalized) continue;

      let validStatus: LicenseStatus = "active";
      if (agency.licenseStatus) {
        const lowerStatus = agency.licenseStatus.toLowerCase();
        if (["active", "expired", "revoked", "suspended"].includes(lowerStatus)) {
          validStatus = lowerStatus as LicenseStatus;
        } else {
          validStatus = "expired";
        }
      }

      if (existingMap.has(normalized)) {
        // Update existing record
        await db
          .updateTable("licensedCollectionAgency")
          .set({
            licenseNumber: agency.licenseNumber ?? null,
            licenseStatus: validStatus,
            updatedAt: new Date(),
          })
          .where("id", "=", existingMap.get(normalized)!)
          .execute();
        results.skipped++; // Treat updates as skipped for new insertion metrics
      } else {
        toInsert.push({
          agencyName: agency.agencyName,
          agencyNameNormalized: normalized,
          province: agency.province,
          licenseNumber: agency.licenseNumber ?? null,
          licenseStatus: validStatus,
          dataSource: agency.dataSource,
          updatedAt: new Date(),
          verifiedAt: agency.dataSource === "ai_verified" ? new Date() : null,
        });
      }
    }

    if (toInsert.length > 0) {
      // Batch insert missing agencies in chunks
      const chunkSize = 500;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        await db
          .insertInto("licensedCollectionAgency")
          .values(toInsert.slice(i, i + chunkSize))
          .execute();
      }
      results.imported += toInsert.length;
    }
  }

  return results;
};