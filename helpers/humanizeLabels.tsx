import { formatDate } from "./formatters";

/**
 * Centralized plain-language label helper for converting technical/jargon terms 
 * to Grade 8 reading level English.
 */
export const humanizeLabels = {
  /**
   * Converts camelCase field names to plain English.
   */
  humanizeFieldName: (fieldName: string): string => {
    const fieldMap: Record<string, string> = {
      currentBalance: "Balance",
      paymentHistoryProfile: "Payment History",
      accountStatus: "Account Status",
      creditLimit: "Credit Limit",
      highCredit: "Highest Amount Owed",
      pastDueAmount: "Past Due Amount",
      monthlyPayment: "Monthly Payment",
      scheduledMonthlyPayment: "Scheduled Monthly Payment",
      paymentFrequency: "Payment Frequency",
      openedDate: "Date Opened",
      closedDate: "Date Closed",
      lastActivityDate: "Last Activity",
      dateOfLastPayment: "Last Payment Date",
      terms: "Payment Terms",
      mop: "Payment Rating",
      interestRate: "Interest Rate",
    };

    if (fieldMap[fieldName]) {
      return fieldMap[fieldName];
    }

    // Fallback: split camelCase and capitalize first letter
    return fieldName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  },

  /**
   * Converts artifact type codes to plain English.
   */
  humanizeArtifactType: (type: string): string => {
    const typeMap: Record<string, string> = {
      credit_report: "Credit Report",
      dispute_letter: "Dispute Letter",
      bureau_response: "Bureau Response",
      consumer_disclosure: "Consumer Disclosure",
    };

    if (typeMap[type]) {
      return typeMap[type];
    }

    // Fallback: replace underscores with spaces and title-case
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  },

  /**
   * Converts severity codes to plain English.
   */
  humanizeSeverity: (severity: string): string => {
    const severityMap: Record<string, string> = {
      ERROR: "Big Problem",
      WARNING: "Heads Up",
      INFO: "Just So You Know",
    };

    if (severityMap[severity]) {
      return severityMap[severity];
    }

    // Fallback: title case
    return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
  },

  /**
   * Converts dispute status codes to plain English.
   */
  /**
   * Converts raw credit bureau account status codes to plain English.
   * Handles compound comma-separated statuses by picking the most serious segment.
   */
  humanizeAccountStatus: (status: string | null | undefined): string => {
    if (!status) return "Unknown";

    const segments = status.split(",");
    let highestPriority = -1;
    let bestText = "";

    for (let segment of segments) {
      segment = segment.trim();
      if (!segment) continue;

      const upper = segment.toUpperCase();
      const lower = segment.toLowerCase();
      let level = 0;
      let text = "";

      if (upper.startsWith("TC") || lower.includes("collection") || lower.includes("turned over")) {
        level = 8;
        text = "Sent to collections";
      } else if (upper.startsWith("WO") || lower.includes("write-off") || lower.includes("bad debt")) {
        level = 7;
        text = "Written off";
      } else if (lower.includes("dispute")) {
        level = 6;
        text = "Being disputed";
      } else if (upper.startsWith("CG") || lower.includes("cancelled by credit grantor") || lower.includes("canceled by credit grantor")) {
        level = 5;
        text = "Closed by the company";
      } else if (upper.startsWith("CZ") || lower.includes("closed at consumer")) {
        level = 4;
        text = "Closed by you";
      } else if (upper.startsWith("AC") || (lower.includes("account closed") && (lower.includes("non derogatory") || lower.includes("non-derogatory")))) {
        level = 3;
        text = "Closed (good standing)";
      } else if (lower.includes("open")) {
        level = 2;
        text = "Open";
      } else if (upper === "X" || upper.startsWith("X-") || lower.includes("unknown")) {
        level = 1;
        text = "Unknown";
      } else {
        level = 0;
        const dashIndex = segment.indexOf("-");
        text = dashIndex >= 0 ? segment.slice(dashIndex + 1).trim() : segment;
      }

      if (level > highestPriority) {
        highestPriority = level;
        bestText = text;
      }
    }

    return bestText || "Unknown";
  },

  /**
   * Converts dispute status codes to plain English.
   */
  humanizeDisputeStatus: (status: string | null | undefined): string => {
    if (!status) {
      return "No Problems";
    }

    const statusMap: Record<string, string> = {
      VIOLATION_PENDING: "Problems Found",
      OBLIGATION_PENDING: "Problems Found",
      CHALLENGED: "Letter Sent",
      NO_RESPONSE: "No Answer Yet",
      INSUFFICIENT_RESPONSE: "Bad Answer",
      PROCEDURALLY_EXHAUSTED: "All Steps Done",
    };

    if (statusMap[status]) {
      return statusMap[status];
    }

    // Fallback: raw value
    return status;
  },

  /**
   * Generates a plain English sentence describing a change.
   */
  humanizeChangeDescription: (
    fieldName: string,
    oldValue: string | null | undefined,
    newValue: string | null | undefined,
    date: Date | string | null | undefined
  ): string => {
    const humanField = humanizeLabels.humanizeFieldName(fieldName);
    const oldVal = oldValue || "blank";
    const newVal = newValue || "blank";
    const dateStr = date ? formatDate(date) : "";

    if (dateStr) {
      return `Your ${humanField} changed from ${oldVal} to ${newVal} on ${dateStr}`;
    }

    return `Your ${humanField} changed from ${oldVal} to ${newVal}`;
  },
};
