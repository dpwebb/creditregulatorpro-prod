import { differenceInDays, parseISO, isValid } from "./dateUtils";
import { TradelineSnapshot } from "./schema";

export type ChangeType = "FINANCIAL" | "TEMPORAL" | "STATUS" | "REMARK" | "OTHER" | "IDENTITY" | "PAYMENT" | "COLLECTION";
export type ChangeSeverity = "INFO" | "WARNING" | "ERROR";

export interface DetectedChange {
  fieldName: string;
  oldValue: string | number | null;
  newValue: string | number | null;
  changeType: ChangeType;
  severity: ChangeSeverity;
  driftAmount?: number; // Days for dates, currency for financial
  message: string;
  confidenceScore: number; // 0-100
}

export interface StandardizedCreditData {
  balance?: number | null;
  amountPastDue?: number | null;
  highCredit?: number | null;
  creditLimit?: number | null;
  dateOpened?: string | null;
  dateClosed?: string | null;
  dateOfFirstDelinquency?: string | null;
  dateOfLastPayment?: string | null;
  accountStatus?: string | null;
  remarks?: string[] | null;
  paymentHistory?: string | null;
  [key: string]: any;
}

const SIGNIFICANT_FINANCIAL_DRIFT = 100; // $100
const SIGNIFICANT_DATE_DRIFT = 30; // 30 days

export function detectChanges(
  prevData: StandardizedCreditData | null,
  currData: StandardizedCreditData | null
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (!prevData || !currData) return changes;

  // 1. Financial Changes
  const financialFields: (keyof StandardizedCreditData)[] = [
    "balance",
    "amountPastDue",
    "highCredit",
    "creditLimit",
  ];

  financialFields.forEach((field) => {
    const oldVal = Number(prevData[field]) || 0;
    const newVal = Number(currData[field]) || 0;
    const diff = Math.abs(newVal - oldVal);

    if (diff > 0) {
      const isSignificant = diff >= SIGNIFICANT_FINANCIAL_DRIFT;
      changes.push({
        fieldName: field as string,
        oldValue: oldVal,
        newValue: newVal,
        changeType: "FINANCIAL",
        severity: isSignificant ? "WARNING" : "INFO",
        driftAmount: diff,
        message: `Financial drift of $${diff.toFixed(2)} detected in ${field}`,
        confidenceScore: 100,
      });
    }
  });

  // 2. Temporal Changes (Dates)
  const dateFields: (keyof StandardizedCreditData)[] = [
    "dateOpened",
    "dateClosed",
    "dateOfFirstDelinquency",
    "dateOfLastPayment",
  ];

  dateFields.forEach((field) => {
    const oldDateStr = prevData[field] as string;
    const newDateStr = currData[field] as string;

    if (oldDateStr && newDateStr && oldDateStr !== newDateStr) {
      const oldDate = parseISO(oldDateStr);
      const newDate = parseISO(newDateStr);

      if (isValid(oldDate) && isValid(newDate)) {
        const diffDays = Math.abs(differenceInDays(newDate, oldDate));

        if (diffDays > 0) {
          const isSignificant = diffDays >= SIGNIFICANT_DATE_DRIFT;
          changes.push({
            fieldName: field as string,
            oldValue: oldDateStr,
            newValue: newDateStr,
            changeType: "TEMPORAL",
            severity: isSignificant ? "ERROR" : "WARNING",
            driftAmount: diffDays,
            message: `Date drift of ${diffDays} days detected in ${field}`,
            confidenceScore: 95,
          });
        }
      }
    } else if ((oldDateStr && !newDateStr) || (!oldDateStr && newDateStr)) {
       changes.push({
        fieldName: field as string,
        oldValue: oldDateStr || null,
        newValue: newDateStr || null,
        changeType: "TEMPORAL",
        severity: "WARNING",
        message: `Date field ${field} was ${oldDateStr ? "removed" : "added"}`,
        confidenceScore: 100,
      });
    }
  });

  // 3. Status Changes
  if (prevData.accountStatus !== currData.accountStatus) {
    changes.push({
      fieldName: "accountStatus",
      oldValue: prevData.accountStatus || null,
      newValue: currData.accountStatus || null,
      changeType: "STATUS",
      severity: "ERROR", // Status changes are usually critical
      message: `Account status changed from ${prevData.accountStatus} to ${currData.accountStatus}`,
      confidenceScore: 100,
    });
  }

  // 4. Remark Codes
  const oldRemarks = new Set(prevData.remarks || []);
  const newRemarks = new Set(currData.remarks || []);
  
  const addedRemarks = [...newRemarks].filter(x => !oldRemarks.has(x));
  const removedRemarks = [...oldRemarks].filter(x => !newRemarks.has(x));

  if (addedRemarks.length > 0 || removedRemarks.length > 0) {
    changes.push({
      fieldName: "remarks",
      oldValue: [...oldRemarks].join(", "),
      newValue: [...newRemarks].join(", "),
      changeType: "REMARK",
      severity: "WARNING",
      message: `Remarks changed: +[${addedRemarks.join(", ")}] -[${removedRemarks.join(", ")}]`,
      confidenceScore: 100,
    });
  }

  return changes;
}

export function detectSnapshotChanges(
  prev: Record<string, any>,
  curr: Record<string, any>
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  const normStr = (s: unknown) => (s ? String(s).trim() : "");
  const normNum = (n: unknown) => (n === null || n === undefined || n === "" ? null : Number(n));

  // 1. FINANCIAL
  const financialFields: (keyof TradelineSnapshot)[] = [
    "balance",
    "currentBalance",
    "amountPastDue",
    "highCredit",
    "creditLimit",
  ];

  financialFields.forEach((field) => {
    const oldVal = normNum(prev[field]);
    const newVal = normNum(curr[field]);

    if (oldVal !== newVal) {
      const diff = Math.abs((newVal || 0) - (oldVal || 0));
      const isSignificant = diff >= SIGNIFICANT_FINANCIAL_DRIFT;
      changes.push({
        fieldName: field as string,
        oldValue: oldVal,
        newValue: newVal,
        changeType: "FINANCIAL",
        severity: isSignificant ? "WARNING" : "INFO",
        driftAmount: diff,
        message: `Financial drift of $${diff.toFixed(2)} detected in ${field}`,
        confidenceScore: 100,
      });
    }
  });

  // 2. TEMPORAL
  const temporalFields: (keyof TradelineSnapshot)[] = [
    "openedDate",
    "dateClosed",
    "dateOfFirstDelinquency",
    "dateOfLastPayment",
    "lastActivityDate",
    "lastReportedDate",
  ];

  temporalFields.forEach((field) => {
    const oldStr = prev[field] as string | null;
    const newStr = curr[field] as string | null;

    if (oldStr && newStr && oldStr !== newStr) {
      const oldDate = parseISO(oldStr);
      const newDate = parseISO(newStr);

      if (isValid(oldDate) && isValid(newDate)) {
        const diffDays = Math.abs(differenceInDays(newDate, oldDate));

        if (diffDays > 0) {
          const isSignificant = diffDays >= SIGNIFICANT_DATE_DRIFT;
          changes.push({
            fieldName: field as string,
            oldValue: oldStr,
            newValue: newStr,
            changeType: "TEMPORAL",
            severity: isSignificant ? "ERROR" : "WARNING",
            driftAmount: diffDays,
            message: `Date drift of ${diffDays} days detected in ${field}`,
            confidenceScore: 95,
          });
        }
      }
    } else if ((oldStr && !newStr) || (!oldStr && newStr)) {
      changes.push({
        fieldName: field as string,
        oldValue: oldStr || null,
        newValue: newStr || null,
        changeType: "TEMPORAL",
        severity: "WARNING",
        message: `Date field ${field} was ${oldStr ? "removed" : "added"}`,
        confidenceScore: 100,
      });
    }
  });

  // 3. STATUS
  if (normStr(prev.status) !== normStr(curr.status)) {
    changes.push({
      fieldName: "status",
      oldValue: prev.status || null,
      newValue: curr.status || null,
      changeType: "STATUS",
      severity: "ERROR",
      message: `Account status changed from ${prev.status || "none"} to ${curr.status || "none"}`,
      confidenceScore: 100,
    });
  }

  if (normStr(prev.mop) !== normStr(curr.mop)) {
    changes.push({
      fieldName: "mop",
      oldValue: prev.mop || null,
      newValue: curr.mop || null,
      changeType: "STATUS",
      severity: "WARNING",
      message: `MOP changed from ${prev.mop || "none"} to ${curr.mop || "none"}`,
      confidenceScore: 100,
    });
  }

  if (normStr(prev.responsibilityCode) !== normStr(curr.responsibilityCode)) {
    changes.push({
      fieldName: "responsibilityCode",
      oldValue: prev.responsibilityCode || null,
      newValue: curr.responsibilityCode || null,
      changeType: "STATUS",
      severity: "WARNING",
      message: `Responsibility code changed from ${prev.responsibilityCode || "none"} to ${curr.responsibilityCode || "none"}`,
      confidenceScore: 100,
    });
  }

  // 4. IDENTITY
  const identityFields: (keyof TradelineSnapshot)[] = [
    "creditorName",
    "accountNumber",
    "accountType",
  ];

  identityFields.forEach((field) => {
    if (normStr(prev[field]) !== normStr(curr[field])) {
      changes.push({
        fieldName: field as string,
        oldValue: prev[field] as string | null,
        newValue: curr[field] as string | null,
        changeType: "IDENTITY",
        severity: "WARNING",
        message: `${field} changed from ${prev[field] || "none"} to ${curr[field] || "none"}`,
        confidenceScore: 100,
      });
    }
  });

  // 5. PAYMENT
  const paymentFields: (keyof TradelineSnapshot)[] = ["paymentPattern", "ecoaCode"];

  paymentFields.forEach((field) => {
    if (normStr(prev[field]) !== normStr(curr[field])) {
      changes.push({
        fieldName: field as string,
        oldValue: prev[field] as string | null,
        newValue: curr[field] as string | null,
        changeType: "PAYMENT",
        severity: "WARNING",
        message: `${field} changed`,
        confidenceScore: 100,
      });
    }
  });

  // 6. COLLECTION
  if (prev.isCollectionAccount !== curr.isCollectionAccount) {
    changes.push({
      fieldName: "isCollectionAccount",
      oldValue: prev.isCollectionAccount ? "true" : "false",
      newValue: curr.isCollectionAccount ? "true" : "false",
      changeType: "COLLECTION",
      severity: curr.isCollectionAccount ? "ERROR" : "WARNING",
      message: `isCollectionAccount changed to ${curr.isCollectionAccount ? "true" : "false"}`,
      confidenceScore: 100,
    });
  }

  const collectionFields: (keyof TradelineSnapshot)[] = [
    "collectionAgencyName",
    "originalCreditorName",
  ];

  collectionFields.forEach((field) => {
    if (normStr(prev[field]) !== normStr(curr[field])) {
      changes.push({
        fieldName: field as string,
        oldValue: prev[field] as string | null,
        newValue: curr[field] as string | null,
        changeType: "COLLECTION",
        severity: "WARNING",
        message: `${field} changed`,
        confidenceScore: 100,
      });
    }
  });

  return changes;
}