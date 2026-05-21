import { describe, expect, it } from "vitest";
import { schema as loginSchema } from "../../endpoints/auth/login_with_password_POST.schema";
import { schema as registerSchema } from "../../endpoints/auth/register_with_password_POST.schema";
import { schema as uploadSchema } from "../../endpoints/ingest/report_POST.schema";
import { schema as approveReviewSchema } from "../../endpoints/review/approve_POST.schema";
import { schema as rejectReviewSchema } from "../../endpoints/review/reject_POST.schema";
import { schema as profileSchema } from "../../endpoints/user/profile_POST.schema";
import { schema as supportTicketSchema } from "../../endpoints/support-ticket/create_POST.schema";
import { schema as violationCorrectionSchema } from "../../endpoints/admin/violation-correction/create_POST.schema";
import { schema as violationCorrectionEvidenceSchema } from "../../endpoints/admin/violation-correction/evidence_POST.schema";
import { schema as violationCorrectionFinalizeSchema } from "../../endpoints/admin/violation-correction/finalize_POST.schema";
import { schema as violationCorrectionUpdateSchema } from "../../endpoints/admin/violation-correction/update_POST.schema";
import { schema as parserTestDeleteSchema } from "../../endpoints/parser-test-case/delete_POST.schema";
import { MAX_UPLOAD_FILE_NAME_LENGTH } from "../../helpers/uploadPayloadValidation";

const pdfBase64 = Buffer.from("%PDF-1.4\n%%EOF", "utf8").toString("base64");
const idImageDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWMAgv8AAQQBAP8H9UQAAAAASUVORK5CYII=";

describe("critical API schema contracts", () => {
  it("validates auth login and registration boundaries", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "Secret123" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "" }).success).toBe(false);

    expect(
      registerSchema.safeParse({
        email: "new.user@example.com",
        password: "StrongPassword123",
        displayName: "New User",
        termsAccepted: true,
        dataConsentAccepted: true,
        legalNameSignature: "New User",
        identificationFileName: "id.png",
        identificationFileType: "image/png",
        identificationFileDataBase64: idImageDataUrl,
      }).success
    ).toBe(true);
    expect(registerSchema.safeParse({ email: "new.user@example.com", password: "short" }).success).toBe(false);
  });

  it("validates upload and profile payloads before DB work starts", () => {
    expect(
      uploadSchema.safeParse({
        region: "CA",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
      }).success
    ).toBe(true);
    expect(
      uploadSchema.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        region: "CA",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
      }).success
    ).toBe(false);
    expect(
      uploadSchema.safeParse({
        region: "US",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
      }).success
    ).toBe(false);
    expect(
      uploadSchema.safeParse({
        region: "CA",
        fileName: `${"a".repeat(MAX_UPLOAD_FILE_NAME_LENGTH)}.pdf`,
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
      }).success
    ).toBe(false);
    expect(
      uploadSchema.safeParse({
        region: "CA",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: "not-valid-base64!",
      }).success
    ).toBe(false);

    expect(
      profileSchema.safeParse({
        fullName: "Test Consumer",
        addressLine1: "1 Main St",
        city: "Halifax",
        province: "NS",
        postalCode: "B3H 0A1",
        dateOfBirth: "1980-01-01",
      }).success
    ).toBe(true);
    expect(profileSchema.safeParse({ fullName: "", addressLine1: "" }).success).toBe(false);
  });

  it("rejects client-supplied userId on review persistence contracts", () => {
    const reviewSessionId = "11111111-1111-4111-8111-111111111111";
    const tradeline = {
      accountNumber: "1234",
      creditorName: "Test Bank",
      accountType: "Credit Card",
      balance: 100,
      status: "Open",
      dates: {},
      amounts: {},
      remarkCodes: [],
    };

    expect(
      approveReviewSchema.safeParse({
        reviewSessionId,
        region: "CA",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
        tradelines: [tradeline],
      }).success
    ).toBe(true);
    expect(
      approveReviewSchema.safeParse({
        reviewSessionId,
        userId: "22222222-2222-4222-8222-222222222222",
        region: "CA",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
        tradelines: [tradeline],
      }).success
    ).toBe(false);

    expect(rejectReviewSchema.safeParse({ reviewSessionId, reason: "Wrong file" }).success).toBe(true);
    expect(
      rejectReviewSchema.safeParse({
        reviewSessionId,
        userId: "22222222-2222-4222-8222-222222222222",
        reason: "Wrong file",
      }).success
    ).toBe(false);
  });

  it("validates packet, support, and admin correction workflow inputs", () => {
    expect(
      supportTicketSchema.safeParse({
        subject: "Upload question",
        description: "I need help with a report upload.",
        category: "DISPUTE_HELP",
        priority: "MEDIUM",
      }).success
    ).toBe(true);
    expect(
      supportTicketSchema.safeParse({
        subject: "",
        description: "",
        category: "UNKNOWN",
      }).success
    ).toBe(false);

    expect(
      violationCorrectionSchema.safeParse({
        extractionRunId: "1",
        tradelineId: "2",
        originalViolationId: "3",
        correctionAction: "corrected",
        correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
        correctedSummary: "Reported balance needs review.",
        status: "in_review",
        evidence: [
          {
            sourceDocumentId: 10,
            extractionRunId: 1,
            tradelineId: 2,
            pageNumber: 1,
            textExcerpt: "Balance field shows 200.",
            evidenceReason: "Supports the corrected issue.",
          },
        ],
        regulationReferences: [
          {
            violationId: 3,
            extractionRunId: 1,
            tradelineId: 2,
            jurisdiction: "federal",
            country: "Canada",
            regulatorOrStandardBody: "Federal privacy framework",
            regulationName: "PIPEDA",
            statuteOrRuleName: "Accuracy principle",
            sectionNumber: "Schedule 1, Principle 4.6",
            regulationTextExcerpt: "Information should be accurate for its purpose.",
            citationSource: "Test fixture",
          },
        ],
      }).success
    ).toBe(true);

    expect(
      violationCorrectionUpdateSchema.safeParse({
        id: "42",
        correctionAction: "corrected",
        correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
        status: "in_review",
      }).success
    ).toBe(true);
    expect(
      violationCorrectionEvidenceSchema.safeParse({
        action: "remove",
        correctionId: "42",
        evidenceId: "7",
      }).success
    ).toBe(true);
    expect(violationCorrectionFinalizeSchema.safeParse({ correctionId: "42" }).success).toBe(true);
    expect(parserTestDeleteSchema.safeParse({ id: "42" }).success).toBe(true);
  });
});
