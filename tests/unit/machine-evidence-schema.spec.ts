import { describe, expect, it } from "vitest";

import { buildMachineEvidence } from "../../scripts/lib/productionEvidenceSchema.mjs";
import { validateMachineEvidence } from "../../scripts/lib/validateMachineEvidence.mjs";

const HEAD = "a".repeat(40);
const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const NOW = "2026-05-22T13:00:00.000Z";

function validEvidence(overrides = {}) {
  return buildMachineEvidence({
    evidenceType: "UNIT_MACHINE_PROOF",
    environment: "production",
    generatedAt: GENERATED_AT,
    commitHash: HEAD,
    generatorScript: "scripts/unit-machine-proof.mjs",
    command: "pnpm run unit:machine-proof",
    status: "pass",
    certifying: true,
    checks: [{ name: "unit-check", status: "pass" }],
    sanitizedArtifacts: [{ path: "docs/production-scale/evidence/unit.json" }],
    ...overrides,
  });
}

describe("machine evidence schema", () => {
  it("accepts valid machine-attested proof", () => {
    const evidence = validEvidence();

    expect(validateMachineEvidence(evidence, {
      expectedEvidenceType: "UNIT_MACHINE_PROOF",
      now: NOW,
    })).toMatchObject({
      ok: true,
      certifying: true,
      errors: [],
    });
    expect(evidence.humanInteractionRequired).toBe(false);
    expect(evidence.humanObserved).toBe(false);
    expect(evidence.manualApprovalRequired).toBe(false);
    expect(evidence.policyVersion).toBe("production-machine-proof-policy-2026-05-22");
  });

  it("rejects simulated-only production proof", () => {
    const evidence = validEvidence({ simulatedOnly: true });

    expect(validateMachineEvidence(evidence, { now: NOW })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["simulated-only evidence cannot be production proof."]),
    });
  });

  it("rejects stale proof", () => {
    const evidence = validEvidence({ freshnessWindowHours: 1 });

    expect(validateMachineEvidence(evidence, { now: "2026-05-22T14:00:01.000Z" })).toMatchObject({
      ok: false,
      stale: true,
    });
  });

  it("rejects missing commit hash", () => {
    const evidence = {
      ...validEvidence(),
      commitHash: "",
    };

    expect(validateMachineEvidence(evidence, { now: NOW }).errors).toEqual(
      expect.arrayContaining([
        "commitHash is required.",
        "commitHash must be a strict 40-hex commit hash.",
      ]),
    );
  });

  it("rejects secret-like strings", () => {
    const evidence = {
      ...validEvidence(),
      metadata: {
        leaked: "postgres://user:secret@example.test:5432/prod",
      },
    };

    const result = validateMachineEvidence(evidence, { now: NOW });

    expect(result.ok).toBe(false);
    expect(result.sensitiveFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "database-url" }),
    ]));
  });

  it("rejects evidence that asks for human interaction", () => {
    const evidence = {
      ...validEvidence(),
      humanInteractionRequired: true,
    };

    expect(validateMachineEvidence(evidence, { now: NOW }).errors).toEqual(
      expect.arrayContaining(["humanInteractionRequired must be false."]),
    );
  });

  it("rejects evidence that depends on human observation or manual approval", () => {
    const evidence = {
      ...validEvidence(),
      humanObserved: true,
      manualApprovalRequired: true,
    };

    expect(validateMachineEvidence(evidence, { now: NOW }).errors).toEqual(
      expect.arrayContaining([
        "humanObserved must be false.",
        "manualApprovalRequired must be false.",
      ]),
    );
  });
});
