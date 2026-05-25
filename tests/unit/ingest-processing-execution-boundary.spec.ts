import { describe, expect, it } from "vitest";

import {
  resolveIngestProcessingRuntimeKind,
  shouldAllowRequestBoundIngestProcessing,
} from "../../helpers/ingestProcessingExecutionBoundary";

describe("ingest processing execution boundary", () => {
  it("allows request-bound processing in local developer runtime without newer lifecycle assumptions", () => {
    const env = { CRP_LOCAL_DEV: "true" };

    expect(resolveIngestProcessingRuntimeKind(env)).toBe("local");
    expect(shouldAllowRequestBoundIngestProcessing(env)).toMatchObject({
      allowed: true,
      runtimeKind: "local",
      explicitFlag: false,
    });
  });

  it("keeps staging and production worker-owned even with the explicit simulation flag", () => {
    expect(shouldAllowRequestBoundIngestProcessing({
      CRP_ENV: "staging",
      CRP_ALLOW_REQUEST_BOUND_INGEST_PROCESSING: "true",
    })).toMatchObject({
      allowed: false,
      runtimeKind: "staging",
      explicitFlag: true,
    });

    expect(shouldAllowRequestBoundIngestProcessing({
      NODE_ENV: "production",
      CRP_LOCAL_DEV: "true",
      CRP_ALLOW_REQUEST_BOUND_INGEST_PROCESSING: "true",
    })).toMatchObject({
      allowed: false,
      runtimeKind: "production",
      explicitFlag: true,
    });
  });

  it("keeps test request-bound processing behind the explicit test flag", () => {
    expect(shouldAllowRequestBoundIngestProcessing({ CRP_ENV: "test" })).toMatchObject({
      allowed: false,
      runtimeKind: "test",
      explicitFlag: false,
    });

    expect(shouldAllowRequestBoundIngestProcessing({
      CRP_ENV: "test",
      CRP_ALLOW_REQUEST_BOUND_INGEST_PROCESSING: "true",
    })).toMatchObject({
      allowed: true,
      runtimeKind: "test",
      explicitFlag: true,
    });
  });

  it("supports an explicit disable flag for local smoke checks", () => {
    expect(shouldAllowRequestBoundIngestProcessing({
      CRP_LOCAL_DEV: "true",
      CRP_DISABLE_REQUEST_BOUND_INGEST_PROCESSING: "true",
    })).toMatchObject({
      allowed: false,
      runtimeKind: "local",
      explicitFlag: false,
    });
  });
});
