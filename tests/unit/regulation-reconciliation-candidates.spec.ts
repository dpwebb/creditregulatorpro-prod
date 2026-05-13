import "../../loadEnv.js";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { DB } from "../../helpers/schema";
import { localLegalAuthorities } from "../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../helpers/regulationRegistry";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import {
  sanitizeReconciliationCandidatePayload,
  createReconciliationCandidatesFromFindings,
  ensureRegulationReconciliationCandidateSchema,
  listRegulationReconciliationCandidates,
  updateRegulationReconciliationCandidateStatus,
} from "../../helpers/regulationReconciliationCandidateService";
import { buildDeterministicViolationRuleEnvelope } from "../../helpers/violationRuleEvidence";
import { evaluateViolationPacketConfidenceGate } from "../../helpers/violationPacketConfidenceGate";
import { assertSafeLocalDatabaseUrl } from "../utils/localDbHarness";

const safeDbUrl = (() => {
  try {
    return assertSafeLocalDatabaseUrl(process.env);
  } catch {
    return null;
  }
})();

const describeIfLocalDb = safeDbUrl ? describe : describe.skip;
let db: Kysely<DB>;

function runId(label: string): string {
  return `unit-test-reconciliation-candidate-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function missingDbFinding(reconciliationRunId: string) {
  return {
    staticReferenceId: "PIPEDA_4_6",
    mismatchType: "missing_db_registry_record" as const,
    severity: "high" as const,
    message: "Static runtime reference PIPEDA_4_6 has no matching DB governance registry record.",
    recommendedAction: "Review whether an inert DB registry record should be created.",
    staticSnapshotHash: "static-hash",
    dbSnapshotHash: "db-hash",
    reconciliationRunId,
    oldValue: {
      staticReferenceId: "PIPEDA_4_6",
      accountNumber: "123456789012",
      note: "SIN 123 456 789 and Account number AB123456789 should not persist.",
    },
    proposedValue: {
      recommendedAction: "Governance review only.",
      packetContent: "Do not persist packet content.",
    },
  };
}

function citationMismatchFinding(reconciliationRunId: string) {
  return {
    staticReferenceId: "PIPEDA_4_6",
    dbRegulationId: "PIPEDA_4_6",
    mismatchType: "citation_mismatch" as const,
    severity: "high" as const,
    message: "Static citation for PIPEDA_4_6 does not match the DB citation format.",
    recommendedAction: "Review citations side by side before any runtime bridge.",
    citation: "Schedule 1, Principle 4.6",
    oldValue: { citation: "Schedule 1, Principle 4.6" },
    proposedValue: { citationFormat: "Schedule 1, Principle 4.7" },
    reconciliationRunId,
  };
}

async function cleanupRunRows(): Promise<void> {
  if (!db) return;
  await sql`
    delete from audit_log
    where details->>'component' = 'regulation_reconciliation_candidate'
      and coalesce(details->>'reconciliationRunId', '') like 'unit-test-reconciliation-candidate-%'
  `.execute(db);
  await db
    .deleteFrom("regulationReconciliationCandidate")
    .where("reconciliationRunId", "like", "unit-test-reconciliation-candidate-%")
    .execute();
  await db
    .deleteFrom("regulationViolationMapping")
    .where("regulationId", "like", "RECON_TEST_%")
    .execute();
  await db
    .deleteFrom("regulationRegistry")
    .where("regulationId", "like", "RECON_TEST_%")
    .execute();
  await db
    .deleteFrom("users")
    .where("email", "like", "unit-test-reconciliation-candidate-%@example.test")
    .execute();
}

async function createAdminUser(label: string): Promise<number> {
  const user = await db
    .insertInto("users")
    .values({
      email: `${runId(label)}@example.test`,
      displayName: `Reconciliation Candidate ${label}`,
      role: "admin",
      emailVerified: true,
      avatarUrl: null,
      organizationId: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return user.id;
}

describe("regulation reconciliation candidate pure safety", () => {
  it("sanitizes personal, packet, and raw report data from candidate payloads", () => {
    const sanitized = sanitizeReconciliationCandidatePayload({
      accountNumber: "123456789012",
      rawExtractedText: "Raw credit report text",
      nested: {
        packetContent: "Packet wording must not persist",
        note: "SIN 123-456-789 and account number AB123456789 should be redacted.",
      },
    });

    const text = JSON.stringify(sanitized);
    expect(text).not.toContain("123456789012");
    expect(text).not.toContain("Raw credit report text");
    expect(text).not.toContain("Packet wording must not persist");
    expect(text).not.toContain("123-456-789");
    expect(text).not.toContain("AB123456789");
    expect(text).toContain("[redacted SIN]");
  });

  it("does not import runtime activation services or packet/parser mutation paths", () => {
    const source = readFileSync(
      join(process.cwd(), "helpers", "regulationReconciliationCandidateService.ts"),
      "utf8",
    );

    expect(source).not.toContain("approveRegulationCandidate");
    expect(source).not.toContain("upsertRegulationViolationMapping");
    expect(source).not.toContain('updateTable("regulationRegistry")');
    expect(source).not.toContain('updateTable("regulationViolationMapping")');
    expect(source).not.toMatch(/from\s+["']\.\/regulationRegistry["']/);
    expect(source).not.toMatch(/from\s+["'].*packet/i);
    expect(source).not.toMatch(/from\s+["'].*parser/i);
    expect(source).not.toContain("VIOLATION_REGULATION_MAP");
  });
});

describeIfLocalDb("regulation reconciliation candidate persistence", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureRegulationReconciliationCandidateSchema();
    await (await import("../../helpers/regulationRegistrySchema")).ensureRegulationRegistrySchema();
  });

  afterEach(async () => {
    await cleanupRunRows();
  });

  afterAll(async () => {
    await cleanupRunRows();
    await db?.destroy();
  });

  it("ensures the inert candidate table, columns, constraints, and indexes idempotently", async () => {
    await ensureRegulationReconciliationCandidateSchema();
    await ensureRegulationReconciliationCandidateSchema();

    const table = await sql<{ tableName: string | null }>`
      select to_regclass('public.regulation_reconciliation_candidate')::text as "tableName"
    `.execute(db);
    expect(table.rows[0]?.tableName).toBe("regulation_reconciliation_candidate");

    const columns = await sql<{ columnName: string }>`
      select column_name as "columnName"
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'regulation_reconciliation_candidate'
    `.execute(db);
    expect(columns.rows.map((row) => row.columnName)).toEqual(
      expect.arrayContaining([
        "id",
        "candidate_type",
        "source_finding_type",
        "mismatch_summary",
        "old_value",
        "proposed_value",
        "mismatch_hash",
        "dedupe_key",
        "review_status",
        "active_status",
        "supersedes_candidate_id",
      ]),
    );

    const constraints = await sql<{ conname: string; contype: string }>`
      select conname, contype
      from pg_constraint
      where conrelid = 'public.regulation_reconciliation_candidate'::regclass
    `.execute(db);
    expect(constraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "regulation_reconciliation_candidate_dedupe_unique",
        "regulation_reconciliation_candidate_inert_check",
      ]),
    );

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'regulation_reconciliation_candidate'
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "idx_regulation_reconciliation_candidate_type",
        "idx_regulation_reconciliation_review_status",
        "idx_regulation_reconciliation_severity",
        "idx_regulation_reconciliation_static_reference",
        "idx_regulation_reconciliation_db_regulation",
        "idx_regulation_reconciliation_db_mapping",
        "idx_regulation_reconciliation_rule",
        "idx_regulation_reconciliation_created_at",
        "idx_regulation_reconciliation_run",
      ]),
    );
  });

  it("creates missing, citation, and consumer wording candidates without duplicates", async () => {
    const reconciliationRunId = runId("create");
    const first = await createReconciliationCandidatesFromFindings({
      reconciliationRunId,
      findings: [
        missingDbFinding(reconciliationRunId),
        citationMismatchFinding(reconciliationRunId),
        {
          staticReferenceId: "PIPEDA_4_6",
          dbRegulationId: "PIPEDA_4_6",
          mismatchType: "consumer_wording_risk",
          severity: "high",
          message: "Static reference PIPEDA_4_6 contains consumer-facing wording that may sound conclusive.",
          recommendedAction: "Review wording as neutral governance metadata only.",
          oldValue: { label: "Confirmed legal violation", accountNumber: "999999999999" },
          proposedValue: { label: "This item may require review under PIPEDA." },
          reconciliationRunId,
        },
      ],
    });
    const second = await createReconciliationCandidatesFromFindings({
      reconciliationRunId,
      findings: [missingDbFinding(reconciliationRunId)],
    });

    expect(first.createdCandidates).toHaveLength(3);
    expect(second.createdCandidates).toHaveLength(0);
    expect(second.existingCandidates).toHaveLength(1);
    expect(first.createdCandidates.every((candidate) => candidate.activeStatus === "inert")).toBe(true);
    expect(first.createdCandidates.every((candidate) => candidate.reviewStatus === "pending_review")).toBe(true);

    const listed = await listRegulationReconciliationCandidates({
      reconciliationRunId,
      includeSnapshotData: true,
    });
    expect(listed).toHaveLength(3);
    expect(listed.map((candidate: any) => candidate.candidateType)).toEqual(
      expect.arrayContaining([
        "missing_db_registry_record_candidate",
        "citation_mismatch_candidate",
        "consumer_wording_risk_candidate",
      ]),
    );
    const serialized = JSON.stringify(listed);
    expect(serialized).toContain("static-hash");
    expect(serialized).toContain("db-hash");
    expect(serialized).not.toContain("123456789012");
    expect(serialized).not.toContain("999999999999");
    expect(serialized).not.toContain("Packet wording must not persist");
  });

  it("supports review-only lifecycle transitions and writes audit rows", async () => {
    const reconciliationRunId = runId("lifecycle");
    const adminUserId = await createAdminUser("lifecycle");
    const created = await createReconciliationCandidatesFromFindings({
      reconciliationRunId,
      findings: [citationMismatchFinding(reconciliationRunId)],
      adminUserId,
    });
    const candidateId = created.createdCandidates[0].id;

    const needsSource = await updateRegulationReconciliationCandidateStatus({
      candidateId,
      reviewStatus: "needs_source",
      adminUserId,
    });
    expect(needsSource.reviewStatus).toBe("needs_source");
    expect(needsSource.activeStatus).toBe("inert");

    const mappingReview = await updateRegulationReconciliationCandidateStatus({
      candidateId,
      reviewStatus: "approved_for_mapping_review",
      reviewNotes: "Approved only for later mapping review.",
      adminUserId,
    });
    expect(mappingReview.reviewStatus).toBe("approved_for_mapping_review");
    expect(mappingReview.activeStatus).toBe("inert");

    const registryReview = await updateRegulationReconciliationCandidateStatus({
      candidateId,
      reviewStatus: "approved_for_registry_update",
      reviewNotes: "Approved only for later registry update review.",
      adminUserId,
    });
    expect(registryReview.reviewStatus).toBe("approved_for_registry_update");
    expect(registryReview.activeStatus).toBe("inert");

    await expect(
      updateRegulationReconciliationCandidateStatus({
        candidateId,
        reviewStatus: "rejected",
        adminUserId,
      }),
    ).rejects.toThrow(/rejectedReason/);

    const rejected = await updateRegulationReconciliationCandidateStatus({
      candidateId,
      reviewStatus: "rejected",
      rejectedReason: "Not the same authority.",
      adminUserId,
    });
    expect(rejected.rejectedReason).toBe("Not the same authority.");

    const archived = await updateRegulationReconciliationCandidateStatus({
      candidateId,
      reviewStatus: "archived",
      adminUserId,
    });
    expect(archived.reviewStatus).toBe("archived");

    const superseded = await updateRegulationReconciliationCandidateStatus({
      candidateId,
      reviewStatus: "superseded",
      supersedesCandidateId: candidateId,
      adminUserId,
    });
    expect(superseded.reviewStatus).toBe("superseded");

    const audits = await sql<{ mode: string | null; reason: string | null; notes: string | null }>`
      select details->>'mode' as mode,
             details->>'reason' as reason,
             details->>'notes' as notes
      from audit_log
      where details->>'component' = 'regulation_reconciliation_candidate'
        and details->>'candidateId' = ${String(candidateId)}
    `.execute(db);
    expect(audits.rows.map((row) => row.mode)).toEqual(
      expect.arrayContaining([
        "reconciliation_candidate_created",
        "reconciliation_candidate_status_changed",
        "reconciliation_candidate_approved_for_mapping_review",
        "reconciliation_candidate_approved_for_registry_update",
        "reconciliation_candidate_rejected",
        "reconciliation_candidate_archived",
        "reconciliation_candidate_superseded",
      ]),
    );
    expect(audits.rows.some((row) => row.reason === "Not the same authority.")).toBe(true);
    expect(audits.rows.some((row) => row.notes === "Approved only for later mapping review.")).toBe(true);
  });

  it("does not mutate runtime registry truth, static references, violation output, packet readiness, or packet wording", async () => {
    await (await import("../../helpers/regulationRegistrySchema")).ensureRegulationRegistrySchema();

    const reconciliationRunId = runId("runtime");
    const adminUserId = await createAdminUser("runtime");
    const regulationId = `RECON_TEST_${Date.now()}`;
    const staticMapBefore = JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP);
    const authoritiesBefore = JSON.stringify(localLegalAuthorities);
    const violationBefore = buildDeterministicViolationRuleEnvelope({
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "WARNING",
      confidenceScore: 95,
      userExplanation: "Reported balance appears inconsistent.",
      recommendedAction: "Review the reported balance.",
      responsibleEntity: "CREDITOR",
      technicalDetails: {
        fieldName: "balance",
        reportedValue: 200,
        expectedValue: 100,
        regulationIds: ["PIPEDA_4_6"],
      },
    } as any);
    const readinessBefore = evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    });
    const packetBefore = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Synthetic report",
      reportDate: "2026-05-13",
      dateGenerated: "2026-05-13",
      recipient: { type: "credit_bureau", name: "Synthetic Bureau", address: ["1 Bureau St"] },
      consumer: { name: "Test Consumer", address: ["1 Consumer St"] },
      disputedItems: [
        {
          issueId: 1,
          tradelineId: 2,
          creditorCollectorName: "Test Creditor",
          accountNumber: "1234567890",
          disputedField: "Balance",
          reportedValue: "$200",
          expectedValue: "$100",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          evidenceReference: "Source report; field: balance; page 1",
          requestedAction: "correct balance",
        },
      ],
      generatedByUserId: 1,
    });

    const registry = await db
      .insertInto("regulationRegistry")
      .values({
        regulationId,
        jurisdiction: "Federal",
        authoritySource: "Unit test source",
        regulationTitle: "Unit Test Regulation",
        sectionNumber: "1",
        subsection: null,
        shortTitle: "Unit Test",
        fullText: "This is inert unit test regulation text with enough words to satisfy non-null source data.",
        plainLanguageSummary: "Unit test registry record.",
        officialSourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
        publicationDate: null,
        effectiveDate: null,
        repealSupersededStatus: "current",
        regulationCategory: "record_accuracy",
        tags: [],
        parserSafeNormalizedText: "unit test regulation text",
        citationFormat: "Unit Test Citation",
        updateVersion: 1,
        activeStatus: "active",
        reviewStatus: "approved",
        confidenceScore: 1,
        sourceContentHash: "unit-test-hash",
        sourceDocumentUrl: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const mapping = await db
      .insertInto("regulationViolationMapping")
      .values({
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        regulationId,
        regulationRecordId: registry.id,
        sectionNumber: "1",
        subsection: null,
        jurisdiction: "Federal",
        explanationTemplate: "Inert test mapping.",
        active: true,
        reviewStatus: "approved",
        approvedBy: null,
        approvedAt: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const candidate = await createReconciliationCandidatesFromFindings({
      reconciliationRunId,
      findings: [citationMismatchFinding(reconciliationRunId)],
      adminUserId,
    });
    await updateRegulationReconciliationCandidateStatus({
      candidateId: candidate.createdCandidates[0].id,
      reviewStatus: "approved_for_mapping_review",
      reviewNotes: "Still inert.",
      adminUserId,
    });
    await updateRegulationReconciliationCandidateStatus({
      candidateId: candidate.createdCandidates[0].id,
      reviewStatus: "approved_for_registry_update",
      reviewNotes: "Still inert.",
      adminUserId,
    });

    const registryAfter = await db
      .selectFrom("regulationRegistry")
      .select(["activeStatus", "reviewStatus"])
      .where("id", "=", registry.id)
      .executeTakeFirstOrThrow();
    const mappingAfter = await db
      .selectFrom("regulationViolationMapping")
      .select(["active", "reviewStatus"])
      .where("id", "=", mapping.id)
      .executeTakeFirstOrThrow();

    expect(registryAfter).toEqual({ activeStatus: "active", reviewStatus: "approved" });
    expect(mappingAfter).toEqual({ active: true, reviewStatus: "approved" });
    expect(JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP)).toBe(staticMapBefore);
    expect(JSON.stringify(localLegalAuthorities)).toBe(authoritiesBefore);
    expect(buildDeterministicViolationRuleEnvelope({
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "WARNING",
      confidenceScore: 95,
      userExplanation: "Reported balance appears inconsistent.",
      recommendedAction: "Review the reported balance.",
      responsibleEntity: "CREDITOR",
      technicalDetails: {
        fieldName: "balance",
        reportedValue: 200,
        expectedValue: 100,
        regulationIds: ["PIPEDA_4_6"],
      },
    } as any)).toEqual(violationBefore);
    expect(evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    })).toEqual(readinessBefore);
    expect(buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Synthetic report",
      reportDate: "2026-05-13",
      dateGenerated: "2026-05-13",
      recipient: { type: "credit_bureau", name: "Synthetic Bureau", address: ["1 Bureau St"] },
      consumer: { name: "Test Consumer", address: ["1 Consumer St"] },
      disputedItems: [
        {
          issueId: 1,
          tradelineId: 2,
          creditorCollectorName: "Test Creditor",
          accountNumber: "1234567890",
          disputedField: "Balance",
          reportedValue: "$200",
          expectedValue: "$100",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          evidenceReference: "Source report; field: balance; page 1",
          requestedAction: "correct balance",
        },
      ],
      generatedByUserId: 1,
    })).toEqual(packetBefore);
  });
});
