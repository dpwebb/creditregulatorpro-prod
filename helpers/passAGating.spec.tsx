import { requirePassA, isPassACompleted, createPassAGatingResponse } from "./passAGating";
import { PassADraftExtraction } from "./passAExtractorTypes";
import * as dbModule from "./db";

describe("passAGating", () => {
  let mockDb: any;

  beforeEach(() => {
    // Mock the db module
    mockDb = {
      selectFrom: jasmine.createSpy("selectFrom").and.returnValue({
        select: jasmine.createSpy("select").and.returnValue({
          where: jasmine.createSpy("where").and.returnValue({
            where: jasmine.createSpy("where").and.returnValue({
              where: jasmine.createSpy("where").and.returnValue({
                executeTakeFirst: jasmine.createSpy("executeTakeFirst"),
              }),
            }),
          }),
        }),
      }),
    };

    spyOnProperty(dbModule, "db", "get").and.returnValue(mockDb);
  });

  describe("A) Gating Logic Tests", () => {
    it("should return success:true when Pass-A exists and is completed", async () => {
      const mockRecord = {
        bureauContext: { bureau_name: { value: "TransUnion", confidence: 0.9, evidence: { page_number: 1, source_method: "pdf_text" as const, snippet: "TransUnion" } } },
        consumerProfile: { legal_name: { given_name: { value: "John", confidence: 0.95, evidence: { page_number: 1, source_method: "pdf_text" as const, snippet: "John" } } }, address_history: [], phone_history: [], employment_history: [] },
        rawEvidence: [],
        conflicts: [],
        missingRequiredFields: [],
        qualityNotes: [],
        completedAt: new Date("2024-01-15T10:00:00Z"),
        channelGuess: "TransUnion Credit Monitoring",
      };

      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(mockRecord));

      const result = await requirePassA(123);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.extraction.doc_id).toBe(123);
        expect(result.extraction.pass).toBe("A");
        expect(result.extraction.schema).toBe("urn:compnd:schemas:pass-a-draft-extraction:v1");
      }
    });

    it("should return success:false with proper error when Pass-A doesn't exist", async () => {
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const result = await requirePassA(456);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(409);
        expect(result.error.message).toBe("Full draft extraction required before further parsing");
        expect(result.error.hint).toBe("Call POST /ingest/report to run full extraction first");
        expect(result.error.artifactId).toBe(456);
      }
    });

    it("should return success:false when Pass-A exists but status is not 'completed'", async () => {
      // The query filters for status='completed', so a non-completed record would not be returned
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const result = await requirePassA(789);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(409);
      }
    });

    it("should return true for completed extractions via isPassACompleted", async () => {
      const mockRecord = { id: 1 };
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(mockRecord));

      const result = await isPassACompleted(123);

      expect(result).toBe(true);
    });

    it("should return false for non-existent extractions via isPassACompleted", async () => {
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const result = await isPassACompleted(456);

      expect(result).toBe(false);
    });

    it("should create HTTP 409 response with correct body structure via createPassAGatingResponse", async () => {
      const response = createPassAGatingResponse(999);

      expect(response.status).toBe(409);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json();
      expect(body.error).toBe("Full draft extraction required before further parsing");
      expect(body.hint).toBe("Call POST /ingest/report to run full extraction first");
      expect(body.artifactId).toBe(999);
    });
  });

  describe("B) Response Structure Tests", () => {
    it("should have gating error with status 409", async () => {
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const result = await requirePassA(100);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(409);
      }
    });

    it('should have gating error message "Full draft extraction required before further parsing"', async () => {
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const result = await requirePassA(200);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Full draft extraction required before further parsing");
      }
    });

    it("should include hint about calling /ingest/report", async () => {
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const result = await requirePassA(300);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.hint).toBe("Call POST /ingest/report to run full extraction first");
      }
    });

    it("should include artifactId in error", async () => {
      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(undefined));

      const testArtifactId = 12345;
      const result = await requirePassA(testArtifactId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.artifactId).toBe(testArtifactId);
      }
    });
  });

  describe("C) Extraction Structure Tests", () => {
    it("should contain all required fields when Pass-A is found", async () => {
      const mockCompletedAt = new Date("2024-01-20T14:30:00Z");
      const mockRecord = {
        bureauContext: {
          bureau_name: {
            value: "TransUnion",
            confidence: 0.9,
            evidence: {
              page_number: 1,
              source_method: "pdf_text" as const,
              snippet: "TransUnion of Canada",
            },
          },
        },
        consumerProfile: {
          legal_name: {
            given_name: {
              value: "Jane",
              confidence: 0.95,
              evidence: {
                page_number: 1,
                source_method: "pdf_text" as const,
                snippet: "Jane Doe",
              },
            },
            surname: {
              value: "Doe",
              confidence: 0.95,
              evidence: {
                page_number: 1,
                source_method: "pdf_text" as const,
                snippet: "Jane Doe",
              },
            },
          },
          address_history: [],
          phone_history: [],
          employment_history: [],
        },
        rawEvidence: [
          {
            path: "consumer_profile.legal_name.given_name",
            value: "Jane",
            confidence: 0.95,
            evidence: {
              page_number: 1,
              source_method: "pdf_text" as const,
              snippet: "Jane Doe",
            },
          },
        ],
        conflicts: [],
        missingRequiredFields: ["date_of_birth"],
        qualityNotes: [
          {
            category: "warning" as const,
            message: "Date of birth not found",
            affected_paths: ["consumer_profile.date_of_birth"],
          },
        ],
        completedAt: mockCompletedAt,
        channelGuess: "TransUnion Consumer Disclosure",
      };

      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(mockRecord));

      const result = await requirePassA(500);

      expect(result.success).toBe(true);
      if (result.success) {
        const extraction = result.extraction;

        // Test all required top-level fields
        expect(extraction.schema).toBe("urn:compnd:schemas:pass-a-draft-extraction:v1");
        expect(extraction.doc_id).toBe(500);
        expect(extraction.pass).toBe("A");
        expect(extraction.channel_guess).toBe("TransUnion Consumer Disclosure");
        expect(extraction.bureau_context).toBeDefined();
        expect(extraction.consumer_profile).toBeDefined();
        expect(extraction.raw_evidence).toBeDefined();
        expect(extraction.conflicts).toBeDefined();
        expect(extraction.missing_required_fields).toBeDefined();
        expect(extraction.quality_notes).toBeDefined();
        expect(extraction.extracted_at).toBeDefined();

        // Test structure contents
        expect(Array.isArray(extraction.raw_evidence)).toBe(true);
        expect(extraction.raw_evidence.length).toBe(1);
        expect(Array.isArray(extraction.conflicts)).toBe(true);
        expect(Array.isArray(extraction.missing_required_fields)).toBe(true);
        expect(extraction.missing_required_fields).toContain("date_of_birth");
        expect(Array.isArray(extraction.quality_notes)).toBe(true);
        expect(extraction.quality_notes.length).toBe(1);
        expect(extraction.quality_notes[0].category).toBe("warning");

        // Test extracted_at is a valid ISO string
        expect(extraction.extracted_at).toBe(mockCompletedAt.toISOString());
      }
    });

    it("should handle string completedAt dates correctly", async () => {
      const mockRecord = {
        bureauContext: {},
        consumerProfile: { address_history: [], phone_history: [], employment_history: [] },
        rawEvidence: [],
        conflicts: [],
        missingRequiredFields: [],
        qualityNotes: [],
        completedAt: "2024-02-01T08:00:00Z",
        channelGuess: null,
      };

      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(mockRecord));

      const result = await requirePassA(600);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.extraction.extracted_at).toBe("2024-02-01T08:00:00Z");
      }
    });

    it("should handle null channelGuess", async () => {
      const mockRecord = {
        bureauContext: {},
        consumerProfile: { address_history: [], phone_history: [], employment_history: [] },
        rawEvidence: [],
        conflicts: [],
        missingRequiredFields: [],
        qualityNotes: [],
        completedAt: new Date("2024-01-15T10:00:00Z"),
        channelGuess: null,
      };

      const executeTakeFirst = mockDb.selectFrom().select().where().where().where().executeTakeFirst;
      executeTakeFirst.and.returnValue(Promise.resolve(mockRecord));

      const result = await requirePassA(700);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.extraction.channel_guess).toBe(null);
      }
    });
  });
});