import assert from "node:assert/strict";
import {
  findAllCrossBureauPairs,
  findCrossBureauSibling,
} from "../helpers/crossBureauMatcher";

type RuntimeTradeline = {
  id: number;
  bureauId: number | null;
  creditorId: number | null;
  creditorName: string | null;
  accountNumber: unknown;
  balance: string | number | null;
  currentBalance?: string | number | null;
};

function runCase(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

function run() {
  runCase("findCrossBureauSibling tolerates non-string account numbers", () => {
    const source: RuntimeTradeline = {
      id: 101,
      bureauId: 1,
      creditorId: 77,
      creditorName: "Acme Finance",
      accountNumber: 492,
      balance: "1200.00",
    };

    const candidate: RuntimeTradeline = {
      id: 102,
      bureauId: 2,
      creditorId: 77,
      creditorName: "Acme Finance",
      accountNumber: "***492",
      balance: "1200.00",
    };

    let sibling: { id: number } | null = null;
    assert.doesNotThrow(() => {
      sibling = findCrossBureauSibling(
        source as unknown as Parameters<typeof findCrossBureauSibling>[0],
        [source, candidate] as unknown as Parameters<typeof findCrossBureauSibling>[1],
      );
    });
    assert.equal(sibling?.id, 102);
  });

  runCase("findCrossBureauSibling handles placeholder account numbers without throwing", () => {
    const source: RuntimeTradeline = {
      id: 201,
      bureauId: 1,
      creditorId: 55,
      creditorName: "Beta Bank",
      accountNumber: "unknown",
      balance: "50",
    };

    const candidate: RuntimeTradeline = {
      id: 202,
      bureauId: 2,
      creditorId: 55,
      creditorName: "Beta Bank",
      accountNumber: "not reported",
      balance: "49",
    };

    let sibling: { id: number } | null = null;
    assert.doesNotThrow(() => {
      sibling = findCrossBureauSibling(
        source as unknown as Parameters<typeof findCrossBureauSibling>[0],
        [source, candidate] as unknown as Parameters<typeof findCrossBureauSibling>[1],
      );
    });
    assert.equal(sibling?.id, 202);
  });

  runCase("findAllCrossBureauPairs handles mixed runtime account types", () => {
    const tradelines: RuntimeTradeline[] = [
      {
        id: 301,
        bureauId: 1,
        creditorId: 91,
        creditorName: "Gamma Credit",
        accountNumber: 12345,
        balance: "900",
      },
      {
        id: 302,
        bureauId: 2,
        creditorId: 91,
        creditorName: "Gamma Credit",
        accountNumber: "***2345",
        balance: "902",
      },
      {
        id: 303,
        bureauId: 1,
        creditorId: 11,
        creditorName: "Delta",
        accountNumber: null,
        balance: null,
      },
    ];

    let pairMap: Map<number, number> = new Map();
    assert.doesNotThrow(() => {
      pairMap = findAllCrossBureauPairs(
        tradelines as unknown as Parameters<typeof findAllCrossBureauPairs>[0],
      );
    });

    assert.equal(pairMap.get(301), 302);
    assert.equal(pairMap.get(302), 301);
  });

  console.log("Tradeline internal regression checks passed.");
}

run();
