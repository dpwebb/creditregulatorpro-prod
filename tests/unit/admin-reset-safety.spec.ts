import { describe, expect, it } from "vitest";

import { validateAdminResetEnvironment } from "../../helpers/adminResetSafety";

const safeEnv = {
  CRP_LOCAL_DEV: "true",
  CRP_ENV: "local",
  NODE_ENV: "test",
  FLOOT_DATABASE_URL: "postgres://local:local@127.0.0.1:5432/creditregulatorpro_local",
  LOCAL_DATABASE_NAME: "creditregulatorpro_local",
};

describe("admin reset environment safety", () => {
  it("allows explicit local development database targets", () => {
    expect(validateAdminResetEnvironment(safeEnv)).toMatchObject({
      ok: true,
      databaseName: "creditregulatorpro_local",
      host: "127.0.0.1",
    });
  });

  it("allows localhost database names used by local staging refreshes", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      FLOOT_DATABASE_URL: "postgres://local:local@localhost:5432/creditregulatorpro_staging",
      LOCAL_DATABASE_NAME: "creditregulatorpro_staging",
    })).toMatchObject({
      ok: true,
      databaseName: "creditregulatorpro_staging",
      host: "localhost",
    });
  });

  it("fails closed without explicit local development opt-in", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      CRP_LOCAL_DEV: "false",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("local development"),
    });
  });

  it("blocks staging and production runtime markers", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      CRP_ENV: "staging",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("staging or production"),
    });

    expect(validateAdminResetEnvironment({
      ...safeEnv,
      NODE_ENV: "production",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("staging or production"),
    });
  });

  it("blocks non-local database hosts", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      FLOOT_DATABASE_URL: "postgres://local:local@staging-db.example.invalid:5432/creditregulatorpro_staging",
      LOCAL_DATABASE_NAME: "creditregulatorpro_staging",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("non-local database hosts"),
    });
  });

  it("fails closed when the database target cannot be classified", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      FLOOT_DATABASE_URL: "",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("cannot classify"),
    });

    expect(validateAdminResetEnvironment({
      ...safeEnv,
      FLOOT_DATABASE_URL: "not a url",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("invalid"),
    });
  });

  it("blocks production-looking database names", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      FLOOT_DATABASE_URL: "postgres://local:local@127.0.0.1:5432/creditregulatorpro_prod",
      LOCAL_DATABASE_NAME: "creditregulatorpro_prod",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("production-looking database names"),
    });
  });

  it("requires LOCAL_DATABASE_NAME to match when it is configured", () => {
    expect(validateAdminResetEnvironment({
      ...safeEnv,
      LOCAL_DATABASE_NAME: "expected_local_db",
    })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("LOCAL_DATABASE_NAME"),
    });
  });
});
