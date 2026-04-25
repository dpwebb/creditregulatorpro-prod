import { z } from "zod";

// Define the structure for a single document in the JSONB package
export const DocumentItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(), // MIME type
  size: z.number(),
  content: z.string(), // Base64 string
  category: z.enum([
    "police_report",
    "government_id",
    "proof_of_address",
    "fraud_evidence",
    "other",
  ]),
  uploadedAt: z.string(), // ISO date string
});

export type DocumentItem = z.infer<typeof DocumentItemSchema>;

// Define the structure for the entire verificationDocuments JSONB column
export const VerificationDocumentsSchema = z.object({
  documents: z.array(DocumentItemSchema).default([]),
  metadata: z
    .object({
      lastUpdated: z.string().optional(),
      completionPercentage: z.number().optional(),
      isComplete: z.boolean().optional(),
    })
    .optional(),
});

export type VerificationDocuments = z.infer<typeof VerificationDocumentsSchema>;

export const REQUIRED_DOCUMENTS = [
  {
    id: "police_report",
    label: "Police Report / Affidavit",
    description:
      "A copy of a police report, investigative report, or a complaint to a law enforcement agency concerning identity theft.",
    required: true,
  },
  {
    id: "government_id",
    label: "Government-Issued ID",
    description:
      "A valid driver's license, passport, or other government-issued identification card.",
    required: true,
  },
  {
    id: "proof_of_address",
    label: "Proof of Address",
    description:
      "A utility bill, bank statement, or insurance statement dated within the last 3 months.",
    required: true,
  },
  {
    id: "fraud_evidence",
    label: "Evidence of Fraud",
    description:
      "Documents supporting your claim, such as unauthorized account statements or credit inquiries.",
    required: false, // Often helpful but strictly speaking the police report is the main trigger for extended alerts
  },
] as const;

export type DocumentCategory = (typeof REQUIRED_DOCUMENTS)[number]["id"];

export interface DocumentStatus {
  completed: number;
  required: number;
  percentage: number;
}

/**
 * Validates the structure of the identity theft report documents object.
 */
export const validateIdentityTheftReport = (
  documents: any,
): { valid: boolean; error?: string } => {
  const result = VerificationDocumentsSchema.safeParse(documents);
  if (!result.success) {
    return { valid: false, error: result.error.message };
  }
  return { valid: true };
};

/**
 * Converts a File object to a base64 string.
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Creates a document item for the JSONB package from a File object.
 */
export const createDocumentItem = async (
  file: File,
  category: DocumentItem["category"],
): Promise<DocumentItem> => {
  const base64 = await fileToBase64(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    size: file.size,
    content: base64,
    category,
    uploadedAt: new Date().toISOString(),
  };
};

/**
 * Calculates the completion status of the documentation.
 */
export const getDocumentStatus = (
  documents: VerificationDocuments | null | undefined,
): DocumentStatus => {
  const requiredCategories = REQUIRED_DOCUMENTS.filter((d) => d.required);
  const totalRequired = requiredCategories.length;

  if (!documents || !documents.documents || totalRequired === 0) {
    return {
      completed: 0,
      required: totalRequired,
      percentage: totalRequired === 0 ? 100 : 0,
    };
  }

  const uploadedCategories = new Set(
    documents.documents.map((doc) => doc.category),
  );

  const completedCount = requiredCategories.filter((req) =>
    uploadedCategories.has(req.id as any),
  ).length;

  return {
    completed: completedCount,
    required: totalRequired,
    percentage: Math.round((completedCount / totalRequired) * 100),
  };
};

/**
 * Checks if all required documentation is present.
 */
export const isDocumentationComplete = (
  documents: VerificationDocuments | null | undefined,
): boolean => {
  return getDocumentStatus(documents).percentage === 100;
};

/**
 * Formats the document list for display, grouping by category if needed.
 * Returns a flat list of formatted strings or objects for UI consumption.
 */
export const formatDocumentList = (
  documents: VerificationDocuments | null | undefined,
): Array<{ name: string; categoryLabel: string; size: string }> => {
  if (!documents || !documents.documents) return [];

  return documents.documents.map((doc) => {
    const categoryDef = REQUIRED_DOCUMENTS.find((d) => d.id === doc.category);
    return {
      name: doc.name,
      categoryLabel: categoryDef ? categoryDef.label : "Other",
      size: `${(doc.size / 1024).toFixed(1)} KB`,
    };
  });
};