import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BANKRUPTCY_LIST_DEFAULT_LIMIT,
  BANKRUPTCY_LIST_MAX_LIMIT,
  schema as bankruptcyListSchema,
} from "../../endpoints/bankruptcy/list_GET.schema";
import {
  CONSUMER_SIGNATURE_LIST_DEFAULT_LIMIT,
  CONSUMER_SIGNATURE_LIST_MAX_LIMIT,
  schema as consumerSignatureListSchema,
} from "../../endpoints/consumer-signature/list_GET.schema";
import {
  CREDITOR_VALIDATION_LIST_DEFAULT_LIMIT,
  CREDITOR_VALIDATION_LIST_MAX_LIMIT,
  schema as creditorValidationListSchema,
} from "../../endpoints/creditor-validation/list_GET.schema";
import {
  DISCRIMINATION_CLAIM_LIST_DEFAULT_LIMIT,
  DISCRIMINATION_CLAIM_LIST_MAX_LIMIT,
  schema as discriminationClaimListSchema,
} from "../../endpoints/discrimination/list_GET.schema";
import {
  EVIDENCE_LIST_DEFAULT_LIMIT,
  EVIDENCE_LIST_MAX_LIMIT,
  schema as evidenceListSchema,
} from "../../endpoints/evidence/list_GET.schema";
import {
  EVIDENCE_ATTACHMENT_LIST_DEFAULT_LIMIT,
  EVIDENCE_ATTACHMENT_LIST_MAX_LIMIT,
  schema as evidenceAttachmentListSchema,
} from "../../endpoints/evidence-attachment/list_GET.schema";
import {
  FRAUD_FREEZE_LIST_DEFAULT_LIMIT,
  FRAUD_FREEZE_LIST_MAX_LIMIT,
  schema as fraudFreezeListSchema,
} from "../../endpoints/fraud-freeze/list_GET.schema";
import {
  METRO2_VALIDATION_LOG_LIST_DEFAULT_LIMIT,
  METRO2_VALIDATION_LOG_LIST_MAX_LIMIT,
  schema as metro2ValidationLogListSchema,
} from "../../endpoints/metro2-validation-log/list_GET.schema";
import {
  OBLIGATION_INSTANCE_LIST_DEFAULT_LIMIT,
  OBLIGATION_INSTANCE_LIST_MAX_LIMIT,
  schema as obligationInstanceListSchema,
} from "../../endpoints/obligation-instance/list_GET.schema";
import {
  PARSER_KNOWN_ENTITY_LIST_DEFAULT_LIMIT,
  PARSER_KNOWN_ENTITY_LIST_MAX_LIMIT,
  schema as parserKnownEntityListSchema,
} from "../../endpoints/parser-known-entity/list_GET.schema";
import {
  PARSER_MAPPING_LIST_DEFAULT_LIMIT,
  PARSER_MAPPING_LIST_MAX_LIMIT,
  schema as parserMappingListSchema,
} from "../../endpoints/parser-mapping/list_GET.schema";
import {
  PARSER_TEST_CASE_LIST_DEFAULT_LIMIT,
  PARSER_TEST_CASE_LIST_MAX_LIMIT,
  schema as parserTestCaseListSchema,
} from "../../endpoints/parser-test-case/list_GET.schema";
import {
  REGULATORY_NOTIFICATION_LIST_DEFAULT_LIMIT,
  REGULATORY_NOTIFICATION_LIST_MAX_LIMIT,
  schema as regulatoryNotificationListSchema,
} from "../../endpoints/regulatory-notification/list_GET.schema";
import {
  REGULATORY_UPDATE_LIST_DEFAULT_LIMIT,
  REGULATORY_UPDATE_LIST_MAX_LIMIT,
  schema as regulatoryUpdateListSchema,
} from "../../endpoints/regulatory-update/list_GET.schema";
import {
  SCANNING_RULE_LIST_DEFAULT_LIMIT,
  SCANNING_RULE_LIST_MAX_LIMIT,
  schema as scanningRuleListSchema,
} from "../../endpoints/scanning-rule/list_GET.schema";
import {
  TRADELINE_LIST_DEFAULT_LIMIT,
  TRADELINE_LIST_MAX_LIMIT,
  schema as tradelineListSchema,
} from "../../endpoints/tradeline/list_GET.schema";
import {
  VERSION_LIST_DEFAULT_LIMIT,
  VERSION_LIST_MAX_LIMIT,
  schema as versionListSchema,
} from "../../endpoints/version/list_GET.schema";

type ListSchemaCase = {
  name: string;
  defaultLimit: number;
  maxLimit: number;
  schema: {
    parse: (value: Record<string, unknown>) => { limit: number; offset?: number };
    safeParse: (value: Record<string, unknown>) => { success: boolean };
  };
};

const listSchemaCases: ListSchemaCase[] = [
  {
    name: "bankruptcy",
    defaultLimit: BANKRUPTCY_LIST_DEFAULT_LIMIT,
    maxLimit: BANKRUPTCY_LIST_MAX_LIMIT,
    schema: bankruptcyListSchema,
  },
  {
    name: "consumer-signature",
    defaultLimit: CONSUMER_SIGNATURE_LIST_DEFAULT_LIMIT,
    maxLimit: CONSUMER_SIGNATURE_LIST_MAX_LIMIT,
    schema: consumerSignatureListSchema,
  },
  {
    name: "creditor-validation",
    defaultLimit: CREDITOR_VALIDATION_LIST_DEFAULT_LIMIT,
    maxLimit: CREDITOR_VALIDATION_LIST_MAX_LIMIT,
    schema: creditorValidationListSchema,
  },
  {
    name: "discrimination",
    defaultLimit: DISCRIMINATION_CLAIM_LIST_DEFAULT_LIMIT,
    maxLimit: DISCRIMINATION_CLAIM_LIST_MAX_LIMIT,
    schema: discriminationClaimListSchema,
  },
  {
    name: "evidence",
    defaultLimit: EVIDENCE_LIST_DEFAULT_LIMIT,
    maxLimit: EVIDENCE_LIST_MAX_LIMIT,
    schema: evidenceListSchema,
  },
  {
    name: "evidence-attachment",
    defaultLimit: EVIDENCE_ATTACHMENT_LIST_DEFAULT_LIMIT,
    maxLimit: EVIDENCE_ATTACHMENT_LIST_MAX_LIMIT,
    schema: evidenceAttachmentListSchema,
  },
  {
    name: "fraud-freeze",
    defaultLimit: FRAUD_FREEZE_LIST_DEFAULT_LIMIT,
    maxLimit: FRAUD_FREEZE_LIST_MAX_LIMIT,
    schema: fraudFreezeListSchema,
  },
  {
    name: "metro2-validation-log",
    defaultLimit: METRO2_VALIDATION_LOG_LIST_DEFAULT_LIMIT,
    maxLimit: METRO2_VALIDATION_LOG_LIST_MAX_LIMIT,
    schema: metro2ValidationLogListSchema,
  },
  {
    name: "obligation-instance",
    defaultLimit: OBLIGATION_INSTANCE_LIST_DEFAULT_LIMIT,
    maxLimit: OBLIGATION_INSTANCE_LIST_MAX_LIMIT,
    schema: obligationInstanceListSchema,
  },
  {
    name: "parser-known-entity",
    defaultLimit: PARSER_KNOWN_ENTITY_LIST_DEFAULT_LIMIT,
    maxLimit: PARSER_KNOWN_ENTITY_LIST_MAX_LIMIT,
    schema: parserKnownEntityListSchema,
  },
  {
    name: "parser-mapping",
    defaultLimit: PARSER_MAPPING_LIST_DEFAULT_LIMIT,
    maxLimit: PARSER_MAPPING_LIST_MAX_LIMIT,
    schema: parserMappingListSchema,
  },
  {
    name: "parser-test-case",
    defaultLimit: PARSER_TEST_CASE_LIST_DEFAULT_LIMIT,
    maxLimit: PARSER_TEST_CASE_LIST_MAX_LIMIT,
    schema: parserTestCaseListSchema,
  },
  {
    name: "regulatory-notification",
    defaultLimit: REGULATORY_NOTIFICATION_LIST_DEFAULT_LIMIT,
    maxLimit: REGULATORY_NOTIFICATION_LIST_MAX_LIMIT,
    schema: regulatoryNotificationListSchema,
  },
  {
    name: "regulatory-update",
    defaultLimit: REGULATORY_UPDATE_LIST_DEFAULT_LIMIT,
    maxLimit: REGULATORY_UPDATE_LIST_MAX_LIMIT,
    schema: regulatoryUpdateListSchema,
  },
  {
    name: "scanning-rule",
    defaultLimit: SCANNING_RULE_LIST_DEFAULT_LIMIT,
    maxLimit: SCANNING_RULE_LIST_MAX_LIMIT,
    schema: scanningRuleListSchema,
  },
  {
    name: "tradeline",
    defaultLimit: TRADELINE_LIST_DEFAULT_LIMIT,
    maxLimit: TRADELINE_LIST_MAX_LIMIT,
    schema: tradelineListSchema,
  },
  {
    name: "version",
    defaultLimit: VERSION_LIST_DEFAULT_LIMIT,
    maxLimit: VERSION_LIST_MAX_LIMIT,
    schema: versionListSchema,
  },
];

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("high-growth list endpoint bounds", () => {
  it.each(listSchemaCases)("applies default and maximum limits for $name", ({ schema, defaultLimit, maxLimit }) => {
    expect(schema.parse({ limit: undefined, offset: undefined })).toMatchObject({
      limit: defaultLimit,
      offset: 0,
    });
    expect(schema.parse({ limit: "7", offset: "2" })).toMatchObject({
      limit: 7,
      offset: 2,
    });
    expect(schema.safeParse({ limit: maxLimit + 1, offset: 0 }).success).toBe(false);
  });

  it("keeps data queries bounded when limit is omitted", () => {
    const boundedSources = [
      "endpoints/bankruptcy/list_GET.ts",
      "endpoints/consumer-signature/list_GET.ts",
      "endpoints/creditor-validation/list_GET.ts",
      "endpoints/discrimination/list_GET.ts",
      "endpoints/evidence/list_GET.ts",
      "helpers/evidenceManager.tsx",
      "endpoints/fraud-freeze/list_GET.ts",
      "endpoints/metro2-validation-log/list_GET.ts",
      "endpoints/obligation-instance/list_GET.ts",
      "endpoints/parser-known-entity/list_GET.ts",
      "endpoints/parser-mapping/list_GET.ts",
      "endpoints/parser-test-case/list_GET.ts",
      "endpoints/regulatory-notification/list_GET.ts",
      "endpoints/regulatory-update/list_GET.ts",
      "endpoints/scanning-rule/list_GET.ts",
      "endpoints/tradeline/list_GET.ts",
      "endpoints/version/list_GET.ts",
    ].map(source);

    for (const text of boundedSources) {
      expect(text).toMatch(/\.limit\(/);
    }
    expect(source("endpoints/evidence-attachment/list_GET.ts")).toContain("limit: validatedInput.limit");
  });

  it("preserves existing owner and admin filter boundaries", () => {
    expect(source("endpoints/bankruptcy/list_GET.ts")).toContain("bankruptcyRecord.userId");
    expect(source("endpoints/consumer-signature/list_GET.ts")).toContain("consumerSignature.userId");
    expect(source("endpoints/creditor-validation/list_GET.ts")).toContain("tradeline.userId");
    expect(source("endpoints/discrimination/list_GET.ts")).toContain("tradeline.userId");
    expect(source("endpoints/evidence/list_GET.ts")).toContain("packet.userId");
    expect(source("endpoints/evidence-attachment/list_GET.ts")).toContain('user.role === "admin"');
    expect(source("endpoints/fraud-freeze/list_GET.ts")).toContain('user.role !== "admin"');
    expect(source("endpoints/obligation-instance/list_GET.ts")).toContain("obligationInstance.userId");
    expect(source("endpoints/tradeline/list_GET.ts")).toContain("tradeline.userId");

    for (const adminRoute of [
      "endpoints/parser-known-entity/list_GET.ts",
      "endpoints/parser-mapping/list_GET.ts",
      "endpoints/parser-test-case/list_GET.ts",
      "endpoints/regulatory-notification/list_GET.ts",
      "endpoints/scanning-rule/list_GET.ts",
      "endpoints/version/list_GET.ts",
    ]) {
      expect(source(adminRoute)).toMatch(/isAdmin|user\.role !== "admin"/);
    }
  });
});
