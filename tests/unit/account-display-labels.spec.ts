import { describe, expect, it } from "vitest";

import {
  accountDisplayName,
  accountDisplayNameNote,
  accountNumberDisplay,
  bureauDisplayName,
  hasReportedAccountValue,
  reportedFieldDisplay,
} from "../../helpers/accountDisplayLabels";

describe("account display labels", () => {
  it("turns parser placeholders into plain user-facing labels", () => {
    expect(accountDisplayName("Unknown Creditor")).toBe("Account from your report");
    expect(accountDisplayNameNote("Unknown Creditor")).toBe("Company name was not clear on this report");
    expect(bureauDisplayName("Unknown Bureau")).toBe("Bureau not listed");
    expect(accountNumberDisplay("Not Provided by Bureau")).toBe("Account number not provided");
    expect(reportedFieldDisplay("N/A")).toBe("Not reported");
    expect(hasReportedAccountValue("FIDO")).toBe(true);
  });
});
