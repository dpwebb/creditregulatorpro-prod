import { describe, expect, it } from "vitest";

import {
  accountNumbersMatch,
  normalizeAccountNumber,
} from "../../helpers/ingestTradelinePersistence";

describe("ingest account-number identity", () => {
  it("treats bureau placeholder account numbers as missing identity anchors", () => {
    expect(normalizeAccountNumber("Not Provided by Bureau")).toBeNull();
    expect(normalizeAccountNumber("Not Provided by Credit Bureau")).toBeNull();
    expect(normalizeAccountNumber("Not supplied by bureau")).toBeNull();
    expect(normalizeAccountNumber("Not supplied by credit bureau")).toBeNull();
    expect(normalizeAccountNumber("Not available from bureau")).toBeNull();
  });

  it("does not match two tradelines only because both omitted account numbers", () => {
    expect(accountNumbersMatch("Not Provided by Bureau", "Not Provided by Bureau")).toBe(false);
    expect(accountNumbersMatch("Not Provided", "Not Available")).toBe(false);
  });

  it("still matches real masked suffix account numbers", () => {
    expect(accountNumbersMatch("********1234", "1234")).toBe(true);
  });
});
