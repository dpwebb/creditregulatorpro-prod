import { afterEach, describe, expect, it, vi } from "vitest";

import { postLogin } from "../../endpoints/auth/login_with_password_POST.schema";

describe("postLogin response handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not surface a raw JSON parser error for empty failed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 502 }))
    );

    await expect(
      postLogin({ email: "admin@example.com", password: "password" })
    ).rejects.toThrow("Login service did not return an error response");
  });

  it("does not surface a raw JSON parser error for invalid failed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad gateway", { status: 502 }))
    );

    await expect(
      postLogin({ email: "admin@example.com", password: "password" })
    ).rejects.toThrow("Login service returned an invalid error response");
  });

  it("uses server-provided login errors when JSON is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Invalid email or password" }, { status: 401 })
      )
    );

    await expect(
      postLogin({ email: "admin@example.com", password: "password" })
    ).rejects.toThrow("Invalid email or password");
  });
});
