import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  let matchMedia: ReturnType<typeof vi.fn>;
  let addEventListener: ReturnType<typeof vi.fn>;
  let removeEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addEventListener = vi.fn();
    removeEventListener = vi.fn();

    matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener,
      removeEventListener,
    });

    (window as any).matchMedia = matchMedia;
  });

  it("should return false by default", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
  });

  it("should call matchMedia with the provided query", () => {
    const query = "(min-width: 768px)";
    renderHook(() => useMediaQuery(query));
    expect(matchMedia).toHaveBeenCalledWith(query);
  });

  it("should add event listener on mount", () => {
    renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("should remove event listener on unmount", () => {
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
