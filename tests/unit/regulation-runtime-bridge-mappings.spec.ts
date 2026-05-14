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
  createRuntimeBridgeMappingDraft,
  ensureRegulationRuntimeBridgeMappingSchema,
  listRuntimeBridgeMappings,
  sanitizeRuntimeBridgeMappingPayload,
  updateRuntimeBridgeMappingStatus,
} from "../../helpers/regulationRuntimeBridgeMappingService";
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
  return `unit-test-runtime-bridge-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bridgeInput(label: string, overrides: Partial<Parameters<typeof createRuntimeBridgeMappingDraft>[0]> = {}) {
  const sourceVersion = runId(label);
  return {
    bridgeMode: "shadow" as const,
    deterministicRuleId: `deterministic-${sourceVersion}`,
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    staticReferenceId: "PIPEDA_4_6",
    dbRegulationId: `BRIDGE_TEST_${sourceVersion}`,
    referenceClass: "official_law" as const,
    consumerWordingMode: "review_reference" as const,
    sourceVersion,
    staticSnapshotHash: `static-${sourceVersion}`,
    dbSnapshotHash: `db-${sourceVersion}`,
    ...overrides,
  };
}

function sampleViolation() {
  return {
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
  } as any;
}

function samplePacketContent() {
  return buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "Synthetic report",
    reportDate: "2026-05-14",
    dateGenerated: "2026-05-14",
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
}

async function cleanupRunRows(): Promise<void> {
  if (!db) return;
  await sql`
    delete from audit_log
    where details->>'component' = 'regulation_runtime_bridge_mapping'
      and (
        coalesce(details->>'sourceVersion', '') like 'unit-test-runtime-bridge-%'
        or coalesce(details->>'dbRegulationId', '') like 'BRIDGE_TEST_%'
      )
  `.execute(db);
  await db
    .deleteFrom("regulationRuntimeBridgeMapping")
    .where((eb) =>
      eb.or([
        eb("sourceVersion", "like", "unit-test-runtime-bridge-%"),
        eb("dbRegulationId", "like", "BRIDGE_TEST_%"),
      ]),
    )
    .execute();
  await db
    .deleteFrom("regulationViolationMapping")
    .where("regulationId", "like", "BRIDGE_TEST_%")
    .execute();
  await db
    .deleteFrom("regulationRegistry")
    .where("regulationId", "like", "BRIDGE_TEST_%")
    .execute();
  await db
    .deleteFrom("users")
    .where("email", "like", "unit-test-runtime-bridge-%@example.test")
    .execute();
}

async function createAdminUser(label: string): Promise<number> {
  const user = await db
    .insertInto("users")
    .values({
      email: `${runId(label)}@example.test`,
      displayName: `Runtime Bridge ${label}`,
      role: "admin",
      emailVerified: true,
      avatarUrl: null,
      organizationId: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return user.id;
}

describe("regulation runtime bridge mapping pure safety", () => {
  it("sanitizes consumer, packet, raw report, SIN, and unmasked account data", () => {
    const sanitized = sanitizeRuntimeBridgeMappingPayload({
      accountNumber: "123456789012",
      rawExtractedText: "Raw credit report text must not persist",
      packetContent: "Packet wording must not persist",
      governance: {
        note: "SIN 123-456-789 and account number AB123456789 should be redacted.",
        reference: "PIPEDA_4_6",
      },
    });

    const text = JSON.stringify(sanitized);
    expect(text).not.toContain("123456789012");
    expect(text).not.toContain("Raw credit report text must not persist");
    expect(text).not.toContain("Packet wording must not persist");
    expect(text).not.toContain("123-456-789");
    expect(text).not.toContain("AB123456789");
    expect(text).toContain("[redacted SIN]");
    expect(text).toContain("PIPEDA_4_6");
  });

  it("does not import runtime selectors, scanner paths, static map mutation paths, or packet/parser paths", () => {
    const serviceSource = readFileSync(
      join(process.cwd(), "helpers", "regulationRuntimeBridgeMappingService.ts"),
      "utf8",
    );
    const endpointSource = [
      "create_POST.ts",
      "list_GET.ts",
      "update-status_POST.ts",
    ].map((file) =>
      readFileSync(
        join(process.cwd(), "endpoints", "regulation-registry", "runtime-bridge", file),
        "utf8",
      ),
    ).join("\n");
    const combined = `${serviceSource}\n${endpointSource}`;

    expect(combined).not.toContain("complianceScanner");
    expect(combined).not.toContain("VIOLATION_REGULATION_MAP");
    expect(combined).not.toContain("approveRegulationCandidate");
    expect(combined).not.toContain("upsertRegulationViolationMapping");
    expect(combined).not.toContain('updateTable("regulationRegistry")');
    expect(combined).not.toContain('updateTable("regulationViolationMapping")');
    expect(combined).not.toContain('insertInto("regulationReconciliationCandidate")');
    expect(combined).not.toMatch(/from\s+["'].*packet/i);
    expect(combined).not.toMatch(/from\s+["'].*parser/i);
    expect(combined).not.toMatch(/runtimeSelector|limitedRuntimeSelector|selectRuntimeReference/);
  });
});

describeIfLocalDb("regulation runtime bridge mapping persistence", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await ensureRegulationRuntimeBridgeMappingSchema();
  });

  afterEach(async () => {
    await cleanupRunRows();
  });

  afterAll(async () => {
    await cleanupRunRows();
    await db?.destroy();
  });

  it("ensures the mapping table, columns, constraints, and indexes idempotently", async () => {
    await ensureRegulationRuntimeBridgeMappingSchema();
    await ensureRegulationRuntimeBridgeMappingSchema();

    const table = await sql<{ tableName: string | null }>`
      select to_regclass('public.regulation_runtime_bridge_mapping')::text as "tableName"
    `.execute(db);
    expect(table.rows[0]?.tableName).toBe("regulation_runtime_bridge_mapping");

    const columns = await sql<{ columnName: string }>`
      select column_name as "columnName"
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'regulation_runtime_bridge_mapping'
    `.execute(db);
    expect(columns.rows.map((row) => row.columnName)).toEqual(
      expect.arrayContaining([
        "id",
        "bridge_mode",
        "deterministic_rule_id",
        "violation_category",
        "static_reference_id",
        "db_regulation_id",
        "db_mapping_id",
        "reference_class",
        "consumer_wording_mode",
        "rollback_static_reference_id",
        "activation_status",
        "activation_reason",
        "test_manifest",
        "approved_by",
        "approved_at",
        "activated_by",
        "activated_at",
        "deactivated_by",
        "deactivated_at",
        "rollback_by",
        "rollback_at",
        "source_version",
        "static_snapshot_hash",
        "db_snapshot_hash",
        "created_at",
        "updated_at",
      ]),
    );

    const constraints = await sql<{ conname: string }>`
      select conname
      from pg_constraint
      where conrelid = 'public.regulation_runtime_bridge_mapping'::regclass
    `.execute(db);
    expect(constraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "regulation_runtime_bridge_mapping_bridge_mode_check",
        "regulation_runtime_bridge_mapping_reference_class_check",
        "regulation_runtime_bridge_mapping_consumer_wording_check",
        "regulation_runtime_bridge_mapping_activation_status_check",
      ]),
    );

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'regulation_runtime_bridge_mapping'
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "idx_reg_runtime_bridge_mapping_bridge_mode",
        "idx_reg_runtime_bridge_mapping_activation_status",
        "idx_reg_runtime_bridge_mapping_rule",
        "idx_reg_runtime_bridge_mapping_violation_category",
        "idx_reg_runtime_bridge_mapping_static_reference",
        "idx_reg_runtime_bridge_mapping_db_regulation",
        "idx_reg_runtime_bridge_mapping_db_mapping",
        "idx_reg_runtime_bridge_mapping_reference_class",
        "idx_reg_runtime_bridge_mapping_consumer_wording",
        "idx_reg_runtime_bridge_mapping_created_at",
        "idx_reg_runtime_bridge_mapping_dedupe",
      ]),
    );

    await expect(sql`
      insert into public.regulation_runtime_bridge_mapping (
        bridge_mode,
        deterministic_rule_id,
        db_regulation_id,
        reference_class,
        consumer_wording_mode,
        activation_status,
        source_version
      ) values (
        'shadow',
        ${runId("invalid-status")},
        ${`BRIDGE_TEST_${runId("invalid-status")}`},
        'official_law',
        'review_reference',
        'invalid_status',
        ${runId("invalid-status")}
      )
    `.execute(db)).rejects.toThrow();

    const futureStatusSourceVersion = runId("future-status");
    await sql`
      insert into public.regulation_runtime_bridge_mapping (
        bridge_mode,
        deterministic_rule_id,
        db_regulation_id,
        reference_class,
        consumer_wording_mode,
        activation_status,
        source_version
      ) values (
        'limited_runtime',
        ${futureStatusSourceVersion},
        ${`BRIDGE_TEST_${futureStatusSourceVersion}`},
        'official_law',
        'review_reference',
        'active_limited_runtime',
        ${futureStatusSourceVersion}
      )
    `.execute(db);

    const directActive = await db
      .selectFrom("regulationRuntimeBridgeMapping")
      .select("activationStatus")
      .where("sourceVersion", "=", futureStatusSourceVersion)
      .executeTakeFirstOrThrow();
    expect(directActive.activationStatus).toBe("active_limited_runtime");
  });

  it("creates a draft bridge mapping, stores governance metadata, sanitizes payloads, and writes audit", async () => {
    const adminUserId = await createAdminUser("create");
    const input = bridgeInput("create", {
      rollbackStaticReferenceId: "PIPEDA_4_6",
      activationReason: "Governance review only for account number AB123456789.",
      testManifest: {
        expectedRuntimeSource: "static_runtime",
        packetContent: "Do not persist packet wording",
        nested: {
          note: "SIN 123 456 789 should be redacted.",
        },
      },
      adminUserId,
    });

    const mapping = await createRuntimeBridgeMappingDraft(input);

    expect(mapping).toEqual(
      expect.objectContaining({
        bridgeMode: "shadow",
        activationStatus: "draft",
        deterministicRuleId: input.deterministicRuleId,
        violationCategory: "BALANCE_CALCULATION_VIOLATION",
        staticReferenceId: "PIPEDA_4_6",
        dbRegulationId: input.dbRegulationId,
        referenceClass: "official_law",
        consumerWordingMode: "review_reference",
        rollbackStaticReferenceId: "PIPEDA_4_6",
      }),
    );

    const listed = await listRuntimeBridgeMappings({
      dbRegulationId: input.dbRegulationId,
      includeTestManifest: true,
    });
    const serialized = JSON.stringify(listed);
    expect(serialized).toContain("static_runtime");
    expect(serialized).not.toContain("Do not persist packet wording");
    expect(serialized).not.toContain("123 456 789");
    expect(serialized).not.toContain("AB123456789");

    const audit = await sql<{ mode: string | null; actor: string | null; dbRegulationId: string | null }>`
      select details->>'mode' as mode,
             details->>'actor' as actor,
             details->>'dbRegulationId' as "dbRegulationId"
      from audit_log
      where details->>'component' = 'regulation_runtime_bridge_mapping'
        and details->>'mappingId' = ${String(mapping.id)}
    `.execute(db);
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "runtime_bridge_mapping_draft_created",
          actor: String(adminUserId),
          dbRegulationId: input.dbRegulationId,
        }),
      ]),
    );
  });

  it("blocks duplicate logical bridge mapping drafts with a safe service error", async () => {
    const adminUserId = await createAdminUser("duplicate");
    const input = {
      ...bridgeInput("duplicate"),
      adminUserId,
    };

    await createRuntimeBridgeMappingDraft(input);

    await expect(createRuntimeBridgeMappingDraft(input)).rejects.toMatchObject({
      message: "Runtime bridge mapping already exists for this logical tuple",
      statusCode: 409,
    });
  });

  it("supports non-runtime status transitions and rejects current runtime activation", async () => {
    const adminUserId = await createAdminUser("status");
    const mapping = await createRuntimeBridgeMappingDraft({
      ...bridgeInput("status", {
        bridgeMode: "limited_runtime",
        rollbackStaticReferenceId: "PIPEDA_4_6",
      }),
      adminUserId,
    });

    const shadow = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "approved_for_shadow",
      activationReason: "Approved for shadow comparison only.",
      adminUserId,
    });
    expect(shadow.activationStatus).toBe("approved_for_shadow");
    expect(String(shadow.approvedBy)).toBe(String(adminUserId));

    const advisory = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "approved_for_advisory",
      activationReason: "Approved for advisory governance only.",
      adminUserId,
    });
    expect(advisory.activationStatus).toBe("approved_for_advisory");

    await expect(updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "approved_for_limited_runtime",
      activationReason: "Missing rollback should fail.",
      testManifest: { expectedRuntimeSource: "static_runtime" },
      adminUserId,
    })).rejects.toThrow(/rollbackStaticReferenceId/);

    await expect(updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "approved_for_limited_runtime",
      activationReason: "Missing manifest should fail.",
      rollbackStaticReferenceId: "PIPEDA_4_6",
      adminUserId,
    })).rejects.toThrow(/testManifest/);

    const limitedReview = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "approved_for_limited_runtime",
      activationReason: "Approved for future limited-runtime review only.",
      rollbackStaticReferenceId: "PIPEDA_4_6",
      testManifest: {
        expectedRuntimeSource: "static_runtime",
        accountNumber: "123456789012",
      },
      adminUserId,
    });
    expect(limitedReview.activationStatus).toBe("approved_for_limited_runtime");
    expect(JSON.stringify(limitedReview.testManifest)).not.toContain("123456789012");

    await expect(updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "rejected",
      adminUserId,
    })).rejects.toThrow(/activationReason/);

    const rejected = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "rejected",
      activationReason: "Rejected as not equivalent.",
      adminUserId,
    });
    expect(rejected.activationStatus).toBe("rejected");

    const paused = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "paused",
      activationReason: "Paused for review.",
      adminUserId,
    });
    expect(paused.activationStatus).toBe("paused");
    expect(String(paused.deactivatedBy)).toBe(String(adminUserId));

    const rolledBack = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "rolled_back",
      activationReason: "Rollback marker only.",
      rollbackStaticReferenceId: "PIPEDA_4_6",
      adminUserId,
    });
    expect(rolledBack.activationStatus).toBe("rolled_back");
    expect(String(rolledBack.rollbackBy)).toBe(String(adminUserId));

    const archived = await updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "archived",
      activationReason: "Archive governance record.",
      adminUserId,
    });
    expect(archived.activationStatus).toBe("archived");

    await expect(updateRuntimeBridgeMappingStatus({
      mappingId: mapping.id,
      activationStatus: "active_limited_runtime",
      activationReason: "Attempt runtime activation.",
      adminUserId,
    })).rejects.toThrow(/unavailable/);

    const audits = await sql<{ mode: string | null; newStatus: string | null }>`
      select details->>'mode' as mode,
             details->>'newStatus' as "newStatus"
      from audit_log
      where details->>'component' = 'regulation_runtime_bridge_mapping'
        and details->>'mappingId' = ${String(mapping.id)}
    `.execute(db);
    expect(audits.rows.map((row) => row.mode)).toEqual(
      expect.arrayContaining([
        "runtime_bridge_mapping_draft_created",
        "runtime_bridge_mapping_approved_for_shadow",
        "runtime_bridge_mapping_approved_for_advisory",
        "runtime_bridge_mapping_approved_for_limited_runtime",
        "runtime_bridge_mapping_rejected",
        "runtime_bridge_mapping_paused",
        "runtime_bridge_mapping_rolled_back",
        "runtime_bridge_mapping_archived",
        "runtime_bridge_activation_rejected_unavailable",
      ]),
    );
    expect(audits.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "runtime_bridge_activation_rejected_unavailable",
          newStatus: "active_limited_runtime",
        }),
      ]),
    );
  });

  it("does not activate DB registry rows, DB mapping rows, static runtime mappings, violation output, packet readiness, or packet wording", async () => {
    const adminUserId = await createAdminUser("runtime-safety");
    const regulationId = `BRIDGE_TEST_${runId("runtime-safety")}`;
    const staticMapBefore = JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP);
    const authoritiesBefore = JSON.stringify(localLegalAuthorities);
    const violationBefore = buildDeterministicViolationRuleEnvelope(sampleViolation());
    const readinessBefore = evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    });
    const packetBefore = samplePacketContent();

    const registry = await db
      .insertInto("regulationRegistry")
      .values({
        regulationId,
        jurisdiction: "Federal",
        authoritySource: "Unit test source",
        regulationTitle: "Runtime Bridge Test Regulation",
        sectionNumber: "1",
        subsection: null,
        shortTitle: "Runtime Bridge Test",
        fullText: "This is an inert unit test regulation record used only for bridge governance safety checks.",
        plainLanguageSummary: "Unit test registry record.",
        officialSourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
        publicationDate: null,
        effectiveDate: null,
        repealSupersededStatus: "current",
        regulationCategory: "record_accuracy",
        tags: [],
        parserSafeNormalizedText: "runtime bridge test regulation",
        citationFormat: "Runtime Bridge Test Citation",
        updateVersion: 1,
        activeStatus: "active",
        reviewStatus: "approved",
        confidenceScore: 1,
        sourceContentHash: runId("hash"),
        sourceDocumentUrl: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const mappingRow = await db
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

    const bridge = await createRuntimeBridgeMappingDraft({
      ...bridgeInput("runtime-safety", {
        dbRegulationId: regulationId,
        dbMappingId: mappingRow.id,
        bridgeMode: "limited_runtime",
      }),
      adminUserId,
    });
    await updateRuntimeBridgeMappingStatus({
      mappingId: bridge.id,
      activationStatus: "approved_for_shadow",
      activationReason: "Shadow only.",
      adminUserId,
    });
    await updateRuntimeBridgeMappingStatus({
      mappingId: bridge.id,
      activationStatus: "approved_for_limited_runtime",
      activationReason: "Governance approval only; runtime selector unavailable.",
      rollbackStaticReferenceId: "PIPEDA_4_6",
      testManifest: { expectedRuntimeSource: "static_runtime" },
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
      .where("id", "=", mappingRow.id)
      .executeTakeFirstOrThrow();

    expect(registryAfter).toEqual({ activeStatus: "active", reviewStatus: "approved" });
    expect(mappingAfter).toEqual({ active: true, reviewStatus: "approved" });
    expect(JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP)).toBe(staticMapBefore);
    expect(JSON.stringify(localLegalAuthorities)).toBe(authoritiesBefore);
    expect(buildDeterministicViolationRuleEnvelope(sampleViolation())).toEqual(violationBefore);
    expect(evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    })).toEqual(readinessBefore);
    expect(samplePacketContent()).toEqual(packetBefore);
  });
});
