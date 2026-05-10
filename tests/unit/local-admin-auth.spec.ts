import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_ADMIN_EMAIL,
  DEFAULT_LOCAL_ADMIN_PASSWORD,
  isLocalhostUrl,
  resolveLocalAdminAuth,
} from "../../scripts/localAdminAuth";

describe("local seeded admin auth contract", () => {
  it("resolves the canonical local seeded admin defaults", () => {
    expect(resolveLocalAdminAuth({})).toMatchObject({
      email: DEFAULT_LOCAL_ADMIN_EMAIL,
      password: DEFAULT_LOCAL_ADMIN_PASSWORD,
      displayName: "Admin",
      legalNameSignature: "DAVID PHILIP WEBB",
    });
  });

  it("normalizes overridden local admin email without changing the password", () => {
    expect(
      resolveLocalAdminAuth({
        LOCAL_DEV_ADMIN_EMAIL: " Admin@Example.COM ",
        LOCAL_DEV_ADMIN_PASSWORD: "custom-password",
      })
    ).toMatchObject({
      email: "admin@example.com",
      password: "custom-password",
    });
  });

  it("identifies localhost E2E targets only", () => {
    expect(isLocalhostUrl("http://localhost:5175")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:5175")).toBe(true);
    expect(isLocalhostUrl("https://staging.creditregulatorpro.com")).toBe(false);
  });
});
