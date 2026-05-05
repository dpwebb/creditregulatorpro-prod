import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the old value until the delay elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 250), {
      initialProps: { value: "first" },
    });

    expect(result.current).toBe("first");

    rerender({ value: "second" });
    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("second");
  });
});
