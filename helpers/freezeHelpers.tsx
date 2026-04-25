import { addDays, addYears } from "./dateUtils";
import { FreezeType, FreezeStatus } from "./schema";

export const FREEZE_TYPE_LABELS: Record<FreezeType, string> = {
  fraud_alert: "Initial Fraud Alert (90 Days)",
  extended_fraud_alert: "Extended Fraud Alert (7 Years)",
  security_freeze: "Security Freeze",
};

export const FREEZE_STATUS_LABELS: Record<FreezeStatus, string> = {
  active: "Active",
  cancelled: "Cancelled",
  expired: "Expired",
  requested: "Requested",
  thawed: "Thawed",
};

export const getFreezeTypeBadgeColor = (type: FreezeType): string => {
  switch (type) {
    case "fraud_alert":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "extended_fraud_alert":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "security_freeze":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

export const getFreezeStatusBadgeColor = (status: FreezeStatus): string => {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800 border-green-200";
    case "requested":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "thawed":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "expired":
      return "bg-gray-100 text-gray-600 border-gray-200";
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

export const calculateFreezeExpiration = (type: FreezeType, requestDate: Date = new Date()): Date | null => {
  switch (type) {
    case "fraud_alert":
      return addDays(requestDate, 90);
    case "extended_fraud_alert":
      return addYears(requestDate, 7);
    case "security_freeze":
      return null; // Indefinite
    default:
      return null;
  }
};

export const validateFreezeDocuments = (type: FreezeType, docs: any): boolean => {
  if (type === "extended_fraud_alert") {
    // Basic check: ensure docs object exists and has keys
    return !!docs && Object.keys(docs).length > 0;
  }
  return true;
};

export const formatFreezeType = (type: FreezeType): string => {
  return FREEZE_TYPE_LABELS[type] || type;
};

export const formatFreezeStatus = (status: FreezeStatus): string => {
  return FREEZE_STATUS_LABELS[status] || status;
};