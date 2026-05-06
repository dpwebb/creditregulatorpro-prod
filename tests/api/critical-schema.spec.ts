import { describe, expect, it } from "vitest";
import { schema as loginSchema } from "../../endpoints/auth/login_with_password_POST.schema";
import { schema as registerSchema } from "../../endpoints/auth/register_with_password_POST.schema";
import { schema as uploadSchema } from "../../endpoints/ingest/report_POST.schema";
import { schema as profileSchema } from "../../endpoints/user/profile_POST.schema";
import { schema as packetBuildSchema } from "../../endpoints/packet/build_POST.schema";
import { schema as supportTicketSchema } from "../../endpoints/support-ticket/create_POST.schema";
import { schema as violationCorrectionSchema } from "../../endpoints/admin/violation-correction/create_POST.schema";
import { schema as violationCorrectionEvidenceSchema } from "../../endpoints/admin/violation-correction/evidence_POST.schema";
import { schema as violationCorrectionFinalizeSchema } from "../../endpoints/admin/violation-correction/finalize_POST.schema";
import { schema as violationCorrectionUpdateSchema } from "../../endpoints/admin/violation-correction/update_POST.schema";

const pdfBase64 = Buffer.from("%PDF-1.4\n%%EOF", "utf8").toString("base64");

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
        region: "US",
        fileName: "credit-report.pdf",
        mimeType: "application/pdf",
        bytesBase64: pdfBase64,
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

  it("validates packet, support, and admin correction workflow inputs", () => {
    expect(packetBuildSchema.safeParse({ obligationInstanceId: 123 }).success).toBe(true);
    expect(packetBuildSchema.safeParse({ obligationInstanceId: "123" }).success).toBe(false);

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
  });
});
