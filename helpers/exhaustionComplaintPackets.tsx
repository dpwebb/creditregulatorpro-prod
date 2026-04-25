import { Selectable } from "kysely";
import { db } from "./db";
import { ObligationInstance, CanadianProvince, CanadianProvinceArrayValues } from "./schema";
import { generateFCACComplaint, generateProvincialComplaint, ComplaintParams } from "./fcacComplaintGenerator";
import { generatePDF } from "./pdfGenerator";
import { uploadPdf } from "./gcsStorage";

/**
 * Generates FCAC and provincial complaint packets when an obligation instance
 * reaches the PROCEDURALLY_EXHAUSTED state.
 *
 * @param instance The procedurally exhausted ObligationInstance.
 * @returns An object containing the generated packet IDs.
 */
export async function generateExhaustionComplaintPackets(
  instance: Selectable<ObligationInstance>
): Promise<{ fcacPacketId: number; provincialPacketId: number }> {
  if (!instance.tradelineId) {
    throw new Error("Obligation instance is not linked to a tradeline. Cannot generate complaints.");
  }

  // 1. Fetch Tradeline
  const tradeline = await db
    .selectFrom("tradeline")
    .selectAll()
    .where("id", "=", instance.tradelineId)
    .executeTakeFirst();

  if (!tradeline) {
    throw new Error(`Tradeline with ID ${instance.tradelineId} not found.`);
  }

  if (!tradeline.userId) {
    throw new Error(`Tradeline ${tradeline.id} is not linked to a user.`);
  }

  if (!tradeline.bureauId) {
    throw new Error(`Tradeline ${tradeline.id} is not linked to a bureau.`);
  }

  // 2. Fetch UserAccount for consumer details
  const user = await db
    .selectFrom("userAccount")
    .selectAll()
    .where("id", "=", tradeline.userId)
    .executeTakeFirst();

  if (!user) {
    throw new Error(`UserAccount with ID ${tradeline.userId} not found.`);
  }

  // 3. Fetch Bureau for bureau details
  const bureau = await db
    .selectFrom("bureau")
    .selectAll()
    .where("id", "=", tradeline.bureauId)
    .executeTakeFirst();

  if (!bureau) {
    throw new Error(`Bureau with ID ${tradeline.bureauId} not found.`);
  }

  // 4. Fetch all ObligationInstances for the tradeline to build exhaustionHistory
  const instances = await db
    .selectFrom("obligationInstance")
    .selectAll()
    .where("tradelineId", "=", tradeline.id)
    .orderBy("createdAt", "asc")
    .execute();

  const exhaustionHistory = instances.map((inst) => {
    let deficiencies = "No specific deficiencies recorded.";
    if (inst.responseAuditFindings) {
      deficiencies =
        typeof inst.responseAuditFindings === "string"
          ? inst.responseAuditFindings
          : JSON.stringify(inst.responseAuditFindings);
    }

    const formattedDate = inst.createdAt
      ? new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(new Date(inst.createdAt))
      : "Unknown Date";

    return {
      date: formattedDate,
      disputeVector: inst.disputeVector || "General Procedural Dispute",
      deficiencies,
    };
  });

  // Construct consumer address
  const consumerAddress = [
    user.addressLine1,
    user.addressLine2,
    [user.city, user.province, user.postalCode].filter(Boolean).join(" "),
  ].filter((line): line is string => typeof line === "string" && line.trim() !== "");

  // Resolve province, fallback to ON if not strictly matching CanadianProvince
  const userProvinceStr = user.province || "ON";
  const province: CanadianProvince = CanadianProvinceArrayValues.includes(userProvinceStr as CanadianProvince)
    ? (userProvinceStr as CanadianProvince)
    : "ON";

  const complaintParams: ComplaintParams = {
    consumerName: user.fullName || "Unknown Consumer",
    consumerAddress,
    consumerEmail: user.email,
    consumerPhone: user.phone || undefined,
    bureauName: bureau.name,
    tradelineId: tradeline.id,
    exhaustionHistory,
    province,
  };

  // 5. Generate content using the complaint generators
  const fcacContent = generateFCACComplaint(complaintParams);
  const provincialContent = generateProvincialComplaint(complaintParams);

  // 6. Generate PDFs
  const fcacPdfBase64 = await generatePDF(fcacContent);
  const provincialPdfBase64 = await generatePDF(provincialContent);

  // 7. Insert the two packet rows in a transaction (without pdfStorageUrl — GCS uploads happen after)
  const [fcacPacket, provincialPacket] = await db
    .transaction()
    .execute(async (trx) => {
      const fcac = await trx
        .insertInto("packet")
        .values({
          type: "FCAC_COMPLAINT",
          bureauId: bureau.id,
          tradelineId: tradeline.id,
          userId: user.id,
          organizationId: instance.organizationId,
          terminalLabel: "PHASE 4: PROCEDURAL EXHAUSTION — PENDING",
          pdfStorageUrl: null,
          status: "GENERATED",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const prov = await trx
        .insertInto("packet")
        .values({
          type: "PROVINCIAL_COMPLAINT",
          bureauId: bureau.id,
          tradelineId: tradeline.id,
          userId: user.id,
          organizationId: instance.organizationId,
          terminalLabel: "PHASE 4: PROCEDURAL EXHAUSTION — PENDING",
          pdfStorageUrl: null,
          status: "GENERATED",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      return [fcac, prov];
    });

  // 8. Upload PDFs to GCS after the transaction completes (GCS ops should not be inside DB transactions)
  const fcacGcsObjectName = `packets/${fcacPacket.id}.pdf`;
  const fcacGcsUrl = await uploadPdf(fcacPdfBase64, fcacGcsObjectName);
  console.log(`FCAC complaint PDF uploaded to GCS: ${fcacGcsUrl}`);

  const provincialGcsObjectName = `packets/${provincialPacket.id}.pdf`;
  const provincialGcsUrl = await uploadPdf(provincialPdfBase64, provincialGcsObjectName);
  console.log(`Provincial complaint PDF uploaded to GCS: ${provincialGcsUrl}`);

  // 9. Update both packet records with their GCS paths
  await db
    .updateTable("packet")
    .set({ pdfStorageUrl: fcacGcsUrl })
    .where("id", "=", fcacPacket.id)
    .execute();

  await db
    .updateTable("packet")
    .set({ pdfStorageUrl: provincialGcsUrl })
    .where("id", "=", provincialPacket.id)
    .execute();

  // 10. Return packet IDs
  return {
    fcacPacketId: fcacPacket.id,
    provincialPacketId: provincialPacket.id,
  };
}