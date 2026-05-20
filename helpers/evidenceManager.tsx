import { db } from "./db";
import PdfPrinter from "pdfmake";
import { format } from "./dateUtils";
import { fetchEvidencePackageData } from "./evidencePackageData";
import { generateDocumentDefinition } from "./evidencePackageSections";
import { ensureRobotoFonts } from "./pdfServerUtils";

/**
 * Records metadata for an uploaded evidence file.
 * Note: The actual file storage is handled by the caller (e.g. S3 or DB blob).
 */
export const uploadEvidence = async (params: {
  obligationInstanceId?: number;
  packetId?: number;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  storageUrl: string;
  description?: string;
  uploadedBy?: number;
  region?: string;
}) => {
  const {
    obligationInstanceId,
    packetId,
    fileName,
    fileType,
    fileSizeBytes,
    storageUrl,
    description,
    uploadedBy,
    region = "CA",
  } = params;

  return await db
    .insertInto("evidenceAttachment")
    .values({
      obligationInstanceId: obligationInstanceId ?? null,
      packetId: packetId ?? null,
      fileName,
      fileType,
      fileSizeBytes,
      storageUrl,
      description: description ?? null,
      uploadedBy: uploadedBy ?? null,
      region,
      uploadedAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
};

/**
 * Retrieves evidence attachments for a given context.
 */
export const getEvidenceAttachments = async (params: {
  obligationInstanceId?: number;
  packetId?: number;
  limit?: number;
  offset?: number;
}) => {
  let query = db.selectFrom("evidenceAttachment");

  if (params.obligationInstanceId) {
    query = query.where("obligationInstanceId", "=", params.obligationInstanceId);
  }
  if (params.packetId) {
    query = query.where("packetId", "=", params.packetId);
  }

  let dataQuery = query.selectAll();
  if (params.limit !== undefined) {
    dataQuery = dataQuery.limit(params.limit);
  }
  if (params.offset !== undefined) {
    dataQuery = dataQuery.offset(params.offset);
  }

  return await dataQuery.execute();
};

/**
 * Deletes an evidence attachment record.
 */
export const deleteEvidence = async (attachmentId: number) => {
  return await db
    .deleteFrom("evidenceAttachment")
    .where("id", "=", attachmentId)
    .execute();
};

/**
 * Generates a comprehensive PDF evidence package.
 * Includes cover page, executive summary, chain of custody, challenge documentation,
 * evidence attachments index, statutory references, and appendices.
 */
export const generateEvidencePackage = async (obligationInstanceId: number) => {
  // 1. Fetch all necessary data
  const data = await fetchEvidencePackageData(obligationInstanceId);

  // 2. Generate document definition with all sections
  const docDefinition = generateDocumentDefinition(data);

  // 3. Generate PDF buffer
  const fonts = await ensureRobotoFonts();
  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  return new Promise<{ pdfBuffer: Buffer; fileName: string }>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const result = Buffer.concat(chunks);
      resolve({
        pdfBuffer: result,
        fileName: `Evidence_Package_${obligationInstanceId}_${format(new Date(), "yyyyMMdd")}.pdf`,
      });
    });
    pdfDoc.on("error", (err) => reject(err));
    pdfDoc.end();
  });
};
