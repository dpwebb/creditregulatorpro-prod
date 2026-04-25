import { ParsedTradeline } from "./reportParser";

export interface ScoredTradeline extends ParsedTradeline {
  confidence: {
    accountNumber: number;
    creditorName: number;
    accountType: number;
    balance: number;
    status: number;
    dates: {
      opened: number;
      reported: number;
      closed: number;
      dofd: number;
    };
    amounts: {
      high: number;
      pastDue: number;
    };
    remarkCodes: number;
    overall: number;
  };
}

/**
 * Calculates confidence scores for tradeline fields based on heuristics.
 * - Checks for missing values
 * - Checks for pattern validity (e.g. masked account numbers)
 * - Checks for logical consistency
 */
export function scoreTradelines(tradelines: ParsedTradeline[]): ScoredTradeline[] {
  return tradelines.map((tl) => {
    const accountNumber = scoreAccountNumber(tl.accountNumber);
    const creditorName = scoreString(tl.creditorName);
    const accountType = scoreString(tl.accountType);
    const balance = scoreNumber(tl.balance);
    const status = scoreString(tl.status);
    const dates = scoreDatesDetailed(tl.dates);
    const amounts = scoreAmountsDetailed(tl.amounts);
    const remarkCodes = scoreRemarkCodes(tl.remarkCodes);

    // Calculate overall confidence as average of all field scores
    const fieldScores = [
      accountNumber,
      creditorName,
      accountType,
      balance,
      status,
      dates.opened,
      dates.reported,
      dates.closed,
      dates.dofd,
      amounts.high,
      amounts.pastDue,
      remarkCodes,
    ];
    
    const overall = fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length;

    return {
      ...tl,
      confidence: {
        accountNumber,
        creditorName,
        accountType,
        balance,
        status,
        dates,
        amounts,
        remarkCodes,
        overall: Number(overall.toFixed(2)),
      },
    };
  });
}

function scoreAccountNumber(val: string): number {
  if (!val) return 0;
  if (val.includes("*") || val.includes("X")) return 0.8; // Masked is expected but less precise
  return 1.0;
}

function scoreString(val: string): number {
  return val && val.length > 0 ? 1.0 : 0.0;
}

function scoreNumber(val: number | undefined): number {
  return typeof val === "number" && !isNaN(val) ? 1.0 : 0.5;
}

function scoreDatesDetailed(dates: any): {
  opened: number;
  reported: number;
  closed: number;
  dofd: number;
} {
  if (!dates) {
    return {
      opened: 0,
      reported: 0,
      closed: 0,
      dofd: 0,
    };
  }

  return {
    opened: scoreDate(dates.opened),
    reported: scoreDate(dates.reported),
    closed: scoreDate(dates.closed),
    dofd: scoreDate(dates.dofd),
  };
}

function scoreDate(date: any): number {
  if (!date) return 0;
  if (date instanceof Date && !isNaN(date.getTime())) return 1.0;
  return 0;
}

function scoreAmountsDetailed(amounts: any): {
  high: number;
  pastDue: number;
} {
  if (!amounts) {
    return {
      high: 0.5,
      pastDue: 0.5,
    };
  }

  return {
    high: scoreNumber(amounts.high),
    pastDue: scoreNumber(amounts.pastDue),
  };
}

function scoreRemarkCodes(remarkCodes: any): number {
  if (!remarkCodes) return 0.5;
  if (Array.isArray(remarkCodes)) {
    return remarkCodes.length > 0 ? 1.0 : 0.5;
  }
  return 0.5;
}