import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DB_IDLE_TIMEOUT_SECONDS,
  DEFAULT_DB_POOL_MAX,
  DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS,
  resolveDbPoolConfig,
  resolveSessionTouchConfig,
  shouldTouchSessionLastAccessed,
} from "../../helpers/runtimeTuningConfig";

describe("runtime tuning configuration", () => {
  it("parses valid DB pool environment values", () => {
    const warn = vi.fn();

    expect(resolveDbPoolConfig({
      CRP_DB_POOL_MAX: "12",
      CRP_DB_IDLE_TIMEOUT_SECONDS: "45",
    }, warn)).toEqual({
      max: 12,
      idleTimeoutSeconds: 45,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back with explicit warnings for invalid DB pool values", () => {
    const warn = vi.fn();

    expect(resolveDbPoolConfig({
      CRP_DB_POOL_MAX: "0",
      CRP_DB_IDLE_TIMEOUT_SECONDS: "not-a-number",
    }, warn)).toEqual({
      max: DEFAULT_DB_POOL_MAX,
      idleTimeoutSeconds: DEFAULT_DB_IDLE_TIMEOUT_SECONDS,
    });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "Invalid numeric runtime configuration; using safe default.",
      expect.objectContaining({ name: "CRP_DB_POOL_MAX", defaultValue: DEFAULT_DB_POOL_MAX }),
    );
    expect(warn).toHaveBeenCalledWith(
      "Invalid numeric runtime configuration; using safe default.",
      expect.objectContaining({
        name: "CRP_DB_IDLE_TIMEOUT_SECONDS",
        defaultValue: DEFAULT_DB_IDLE_TIMEOUT_SECONDS,
      }),
    );
  });

  it("parses valid session touch interval and falls back on unsafe values", () => {
    const validWarn = vi.fn();
    expect(resolveSessionTouchConfig({
      CRP_SESSION_TOUCH_INTERVAL_SECONDS: "600",
    }, validWarn)).toEqual({ touchIntervalSeconds: 600 });
    expect(validWarn).not.toHaveBeenCalled();

    const invalidWarn = vi.fn();
    expect(resolveSessionTouchConfig({
      CRP_SESSION_TOUCH_INTERVAL_SECONDS: "900000",
    }, invalidWarn)).toEqual({
      touchIntervalSeconds: DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS,
    });
    expect(invalidWarn).toHaveBeenCalledWith(
      "Invalid numeric runtime configuration; using safe default.",
      expect.objectContaining({
        name: "CRP_SESSION_TOUCH_INTERVAL_SECONDS",
        defaultValue: DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS,
      }),
    );
  });

  it("detects stale session lastAccessed values without touching fresh ones", () => {
    const now = new Date("2026-05-20T10:05:00.000Z");

    expect(shouldTouchSessionLastAccessed(
      new Date("2026-05-20T10:03:00.000Z"),
      now,
      300,
    )).toBe(false);
    expect(shouldTouchSessionLastAccessed(
      new Date("2026-05-20T09:59:59.000Z"),
      now,
      300,
    )).toBe(true);
    expect(shouldTouchSessionLastAccessed(new Date("invalid"), now, 300)).toBe(true);
  });
});
