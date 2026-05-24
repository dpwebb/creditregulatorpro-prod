import { describe, expect, it } from "vitest";

import { validateCollectionAgencyName } from "../../helpers/collectionAgencyRegistry";
import {
  FINDING_TAXONOMY_ALIASES,
  canonicalFindingCodeFor,
  canonicalFindingLabelFor,
  neutralizeFindingText,
} from "../../helpers/findingTaxonomy";
import {
  NARRATIVE_ARCHETYPE_REGISTRY,
  canonicalDisputeIntentFor,
} from "../../helpers/disputeIntent";

describe("finding taxonomy normalization", () => {
  it("keeps persisted stable IDs while exposing neutral canonical names", () => {
    expect(FINDING_TAXONOMY_ALIASES.PAYMENT_HISTORY_MANIPULATION).toMatchObject({
      stableId: "PAYMENT_HISTORY_MANIPULATION",
      canonicalCode: "PAYMENT_HISTORY_INCONSISTENCY",
      displayLabel: "Payment history inconsistency",
    });
    expect(canonicalFindingCodeFor("TEMPORAL_MANIPULATION")).toBe("REPORTING_CHRONOLOGY_CONFLICT");
    expect(canonicalFindingLabelFor("DOCUMENTATION_CHAIN_FAILURE")).toBe("Incomplete account documentation");
  });

  it("neutralizes legacy internal labels before text reaches consumer surfaces", () => {
    const text = neutralizeFindingText(
      "PAYMENT_HISTORY_MANIPULATION and Documentation Chain Failure indicate illegal reporting that must be removed.",
    );

    expect(text).toContain("Payment history inconsistency");
    expect(text).toContain("incomplete account documentation");
    expect(text).not.toMatch(/PAYMENT_HISTORY_MANIPULATION|Documentation Chain Failure|illegal reporting|must be removed/i);
  });

  it("uses neutral collection agency validation flags", () => {
    const missing = validateCollectionAgencyName("", "ON");
    const generic = validateCollectionAgencyName("COLLECTION DEPT", "ON");
    const masked = validateCollectionAgencyName("XXX RECOVERY INC", "ON");
    const flags = [...missing.flags, ...generic.flags, ...masked.flags].join(" ");

    expect(flags).toMatch(/verified|verify/i);
    expect(flags).not.toMatch(/severe violation|must be reported|exact registered agency|cannot be hidden|illegal/i);
  });
});

describe("narrative archetype registry", () => {
  it("renders distinct concise narratives for canonical dispute intents", () => {
    const intents = [
      "INCOMPLETE_COLLECTION_REPORTING",
      "PAYMENT_HISTORY_INCONSISTENCY",
      "REPORTING_CHRONOLOGY_CONFLICT",
      "UNVERIFIABLE_COLLECTION_IDENTITY",
    ].map((issueType) => canonicalDisputeIntentFor({ issueType }));

    const narratives = intents.map((intent) => NARRATIVE_ARCHETYPE_REGISTRY[intent].consumerNarrative);

    expect(intents).toEqual([
      "INCOMPLETE_COLLECTION_REPORTING",
      "INCONSISTENT_PAYMENT_REPORTING",
      "REPORTING_CHRONOLOGY_CONFLICT",
      "UNVERIFIABLE_COLLECTION_IDENTITY",
    ]);
    expect(new Set(narratives).size).toBe(narratives.length);
    expect(narratives.every((narrative) => narrative.split(/\s+/).length <= 22)).toBe(true);
    expect(narratives.join(" ")).not.toMatch(/statutory violation|legal violation|illegal|violates/i);
  });

  it("aligns requested actions with the dispute intent", () => {
    expect(NARRATIVE_ARCHETYPE_REGISTRY.INCOMPLETE_COLLECTION_REPORTING.requestedAction).toBe("verify collection details");
    expect(NARRATIVE_ARCHETYPE_REGISTRY.UNVERIFIABLE_COLLECTION_IDENTITY.requestedAction).toBe("verify collection details");
    expect(NARRATIVE_ARCHETYPE_REGISTRY.REPORTING_CHRONOLOGY_CONFLICT.requestedAction).toBe("correct date");
    expect(NARRATIVE_ARCHETYPE_REGISTRY.INCONSISTENT_PAYMENT_REPORTING.requestedAction).toBe("correct payment history");
  });
});

