import { detectDisclosureDeficiency } from "./complianceDetectorDisclosure";

declare const vi: any;

const executeRequirementsMock = vi.fn();
const executeExtractionMock = vi.fn();

vi.mock("./db", () => ({
  db: {
    selectFrom: vi.fn((table: string) => {
      if (table === "disclosureRequirement") {
        return {
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          execute: executeRequirementsMock,
        };
      }

      if (table === "passExtraction") {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          selectAll: vi.fn().mockReturnThis(),
          executeTakeFirst: executeExtractionMock,
        };
      }

      throw new Error(`Unexpected table in mock: ${table}`);
    }),
  },
}));

vi.mock("./resolveTradelineProvince", () => ({
  resolveProvinceByIds: vi.fn(async () => "ON"),
}));

describe("detectDisclosureDeficiency creditor-name presence checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRequirementsMock.mockResolvedValue([
      {
        requirementCode: "SRC-01",
        description: "Identify furnisher/creditor for each item",
        fieldPath: "accounts[].creditor_name",
        severity: "ERROR",
        category: "SOURCES",
        statuteCode: "PIPEDA_4_9",
      },
    ]);
  });

  it("does not raise disclosure deficiency when extraction uses camelCase creditorName", async () => {
    executeExtractionMock.mockResolvedValue({
      accounts: [
        {
          accountNumber: "1234",
          creditorName: "TD BANK",
        },
      ],
    });

    const result = await detectDisclosureDeficiency(
      {
        id: 100,
        userId: 200,
        reportArtifactId: 300,
        accountNumber: "****1234",
        creditorId: null,
        originalCreditorName: null,
        collectionAgencyName: null,
      } as any
    );

    expect(result.length).toBe(0);
  });

  it("does not raise disclosure deficiency when tradeline has creditor linkage fallback", async () => {
    executeExtractionMock.mockResolvedValue({
      accounts: [
        {
          account_number_partial: { value: "8888" },
        },
      ],
    });

    const result = await detectDisclosureDeficiency(
      {
        id: 101,
        userId: 201,
        reportArtifactId: 301,
        accountNumber: "****8888",
        creditorId: 55,
        originalCreditorName: null,
        collectionAgencyName: null,
      } as any
    );

    expect(result.length).toBe(0);
  });

  it("still raises disclosure deficiency when creditor data is missing everywhere", async () => {
    executeExtractionMock.mockResolvedValue({
      accounts: [
        {
          account_number_partial: { value: "9999" },
        },
      ],
    });

    const result = await detectDisclosureDeficiency(
      {
        id: 102,
        userId: 202,
        reportArtifactId: 302,
        accountNumber: "****9999",
        creditorId: null,
        originalCreditorName: null,
        collectionAgencyName: null,
      } as any
    );

    expect(result.length).toBe(1);
    expect(result[0].violationCategory).toBe("DISCLOSURE_DEFICIENCY");
    expect(result[0].technicalDetails.fieldPath).toBe("accounts[].creditor_name");
  });
});
