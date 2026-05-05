import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

expect.addSnapshotSerializer({
  serialize(value) {
    return String(value);
  },
  test(value) {
    return value instanceof Error;
  },
});
