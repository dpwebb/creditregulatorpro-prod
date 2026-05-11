import { createHash } from "node:crypto";

import { db } from "./db";
import { getBureauDisputeAddress } from "./bureauDisputeAddresses";
import { BusinessRuleError } from "./endpointErrorHandler";
import type { User } from "./User";
import { sanitizeComplianceNeutralText } from "./violationCorrectionValidation";
import {
  actionForIssue,
  buildSimpleDisputePacketContent,
  labelizeIssueType,
  maskAccountNumber,
  redactSensitiveText,
  type DisputePacketType,
  type PacketRequestedAction,
  type SimpleDisputePacketContent,
  type SimpleDisputedItemInput,
} from "./disputePacketTemplate";

export interface DisputePacketRecipientInput {
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export interface DisputePacketBuildInput {
  packetType: DisputePacketType;
  selectedIssueIds: number[];
  recipientBureauId?: number | null;
  recipient?: DisputePacketRecipientInput;
}

export interface DisputePacketCandidate {
  issueId: number;
  tradelineId: number;
  userId: number;
  userEmail: string | null;
  userDisplayName: string | null;
  packetTypes: DisputePacketType[];
  bureauName: string | null;
  creditorCollectorName: string;
  collectionAgencyName: string | null;
  maskedAccountNumber: string;
  issueType: string;
  explanation: string;
  evidenceReference: string;
  requestedAction: PacketRequestedAction;
  needsManualReview: boolean;
  reportDate: string | null;
}

type IssueRow = {
  issueId: number;
  issueUserExplanation: string | null;
  issueRecommendedAction: string | null;
  issueViolationCategory: string | null;
  issueDisputeVector: string | null;
  issueTechnicalDetails: unknown;
  issueUserStatus: string | null;
  tradelineId: number;
  userId: number | null;
  userEmail: string | null;
  userDisplayName: string | null;
  consumerFullName: string | null;
  consumerEmail: string | null;
  consumerAddressLine1: string | null;
  consumerAddressLine2: string | null;
  consumerCity: string | null;
  consumerProvince: string | null;
  consumerPostalCode: string | null;
  consumerPhone: string | null;
  bureauId: number | null;
  bureauName: string | null;
  bureauAddressLine1: string | null;
  bureauAddressLine2: string | null;
  bureauCity: string | null;
  bureauProvince: string | null;
  bureauPostalCode: string | null;
  creditorName: string | null;
  accountNumber: string | null;
  accountType: string | null;
  status: string | null;
  balance: string | null;
  currentBalance: string | null;
  creditLimit: string | null;
  highCredit: string | null;
  amountPastDue: string | null;
  openedDate: Date | null;
  dateClosed: Date | null;
  dateOfFirstDelinquency: Date | null;
  dateOfLastPayment: Date | null;
  lastActivityDate: Date | null;
  lastReportedDate: Date | null;
  collectionAgencyName: string | null;
  originalCreditorName: string | null;
  isCollectionAccount: boolean | null;
  reportArtifactId: number | null;
  reportDate: Date | null;
  sourceText: string | null;
};

type RecipientRecord = {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  addressLines: string[];
};

function hashEvent(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseDetails(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstText(details: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstKnownText(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function toPacketDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString();
}

function fieldFromDetails(row: IssueRow, details: Record<string, unknown>): string | null {
  const evidence = objectValue(details.evidenceLink) ?? objectValue(objectValue(details.deterministicRule)?.evidence);
  return firstKnownText([
    firstText(details, ["fieldName", "canonicalField", "field", "sourceField", "disputedField"]),
    evidence ? firstText(evidence, ["fieldName", "field"]) : null,
  ]);
}

function valueFromTradeline(row: IssueRow, fieldName: string | null): unknown {
  const normalized = String(fieldName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normalized.includes("accountnumber")) return row.accountNumber;
  if (normalized.includes("balance")) return row.balance ?? row.currentBalance;
  if (normalized.includes("currentbalance")) return row.currentBalance ?? row.balance;
  if (normalized.includes("creditlimit")) return row.creditLimit;
  if (normalized.includes("highcredit")) return row.highCredit;
  if (normalized.includes("pastdue")) return row.amountPastDue;
  if (normalized.includes("status") || normalized.includes("mop")) return row.status;
  if (normalized.includes("opened")) return row.openedDate;
  if (normalized.includes("closed")) return row.dateClosed;
  if (normalized.includes("firstdelinquency")) return row.dateOfFirstDelinquency;
  if (normalized.includes("lastpayment")) return row.dateOfLastPayment;
  if (normalized.includes("lastactivity")) return row.lastActivityDate;
  if (normalized.includes("reported")) return row.lastReportedDate;
  if (normalized.includes("collectionagency")) return row.collectionAgencyName;
  return null;
}

function issueTypeForRow(row: IssueRow): string {
  return firstKnownText([row.issueViolationCategory, row.issueDisputeVector]) ?? "reporting_issue";
}

function evidenceReferenceForRow(row: IssueRow, details: Record<string, unknown>): string {
  const evidence = objectValue(details.evidenceLink) ?? objectValue(objectValue(details.deterministicRule)?.evidence);
  const parts: string[] = [];
  const reportArtifactId =
    evidence && typeof evidence.reportArtifactId === "number"
      ? evidence.reportArtifactId
      : row.reportArtifactId;

  if (reportArtifactId) parts.push(`Source report #${reportArtifactId}`);

  const fieldName = evidence ? firstText(evidence, ["fieldName", "field"]) : null;
  if (fieldName) parts.push(`field: ${labelizeIssueType(fieldName)}`);

  const pageNumber = evidence ? Number(evidence.pageNumber ?? evidence.page) : Number(details.pageNumber ?? details.page);
  if (Number.isFinite(pageNumber) && pageNumber > 0) parts.push(`page ${pageNumber}`);

  const snippet = firstKnownText([
    evidence ? firstText(evidence, ["textSnippet", "excerpt"]) : null,
    firstText(details, ["textSnippet", "evidenceSnippet", "excerpt"]),
  ]);
  if (snippet) parts.push(`excerpt: ${redactSensitiveText(snippet, row.accountNumber).slice(0, 180)}`);

  if (parts.length > 0) return parts.join("; ");
  if (row.sourceText && row.sourceText.trim()) return `Source report text for tradeline #${row.tradelineId}`;
  return "Needs manual review";
}

function rowHasCollectionRecipient(row: IssueRow): boolean {
  return Boolean(row.collectionAgencyName?.trim());
}

function packetTypesForRow(row: IssueRow): DisputePacketType[] {
  const types: DisputePacketType[] = ["credit_bureau"];
  const issueType = issueTypeForRow(row).toUpperCase();
  if (
    rowHasCollectionRecipient(row) &&
    (row.isCollectionAccount === true ||
      issueType.includes("COLLECTOR") ||
      issueType.includes("COLLECTION") ||
      issueType.includes("PHANTOM_DEBT") ||
      issueType.includes("MULTIPLE_COLLECTOR"))
  ) {
    types.push("collection_agency");
  }
  return types;
}

function candidateFromRow(row: IssueRow, packetType: DisputePacketType = "credit_bureau"): DisputePacketCandidate {
  const details = parseDetails(row.issueTechnicalDetails);
  const evidenceReference = evidenceReferenceForRow(row, details);
  const creditorCollectorName =
    packetType === "collection_agency"
      ? firstKnownText([row.collectionAgencyName, row.creditorName, row.originalCreditorName]) ?? "Collection agency"
      : firstKnownText([row.creditorName, row.originalCreditorName, row.collectionAgencyName]) ?? "Company listed on report";

  return {
    issueId: row.issueId,
    tradelineId: row.tradelineId,
    userId: Number(row.userId),
    userEmail: row.userEmail,
    userDisplayName: row.userDisplayName,
    packetTypes: packetTypesForRow(row),
    bureauName: row.bureauName,
    creditorCollectorName: redactSensitiveText(creditorCollectorName),
    collectionAgencyName: row.collectionAgencyName ? redactSensitiveText(row.collectionAgencyName) : null,
    maskedAccountNumber: maskAccountNumber(row.accountNumber),
    issueType: labelizeIssueType(issueTypeForRow(row)),
    explanation: redactSensitiveText(
      sanitizeComplianceNeutralText(row.issueUserExplanation ?? row.issueRecommendedAction) ??
        "Review this account information against the source report.",
      row.accountNumber,
    ),
    evidenceReference,
    requestedAction: actionForIssue(issueTypeForRow(row), packetType),
    needsManualReview: evidenceReference === "Needs manual review",
    reportDate: toPacketDate(row.reportDate),
  };
}

function toDisputedItemInput(row: IssueRow, packetType: DisputePacketType): SimpleDisputedItemInput {
  const details = parseDetails(row.issueTechnicalDetails);
  const fieldName = fieldFromDetails(row, details);
  const reportedValue =
    firstText(details, ["reportedValue", "actualValue", "detectedValue", "currentValue", "reportedAs"]) ??
    valueFromTradeline(row, fieldName) as string | number | Date | null;
  const expectedValue =
    firstText(details, ["expectedValue", "correctedValue", "expected", "shouldBe", "basisValue"]) ??
    "Not known";
  const creditorName = firstKnownText([row.creditorName, row.originalCreditorName, row.collectionAgencyName]);
  const collectionName = firstKnownText([row.collectionAgencyName, row.creditorName, row.originalCreditorName]);

  return {
    issueId: row.issueId,
    tradelineId: row.tradelineId,
    creditorCollectorName: packetType === "collection_agency" ? collectionName : creditorName,
    sourceFurnisherName: packetType === "credit_bureau" ? firstKnownText([row.creditorName, row.originalCreditorName]) : row.originalCreditorName,
    accountNumber: row.accountNumber,
    disputedField: fieldName ?? "Account information",
    reportedValue,
    expectedValue,
    issueType: issueTypeForRow(row),
    explanation: row.issueUserExplanation ?? row.issueRecommendedAction,
    evidenceReference: evidenceReferenceForRow(row, details),
    requestedAction: actionForIssue(issueTypeForRow(row), packetType),
  };
}

function addressLinesFromRecipient(recipient: RecipientRecord): string[] {
  if (recipient.addressLines.length > 0) return recipient.addressLines;
  const lines = [
    recipient.addressLine1,
    recipient.addressLine2,
    recipient.city && recipient.province && recipient.postalCode
      ? `${recipient.city}, ${recipient.province} ${recipient.postalCode}`
      : null,
  ];
  return lines.filter((line): line is string => Boolean(line));
}

function recipientFromInput(input: DisputePacketRecipientInput | undefined, fallbackName: string): RecipientRecord {
  const name = input?.name?.trim() || fallbackName;
  const addressLines = [
    input?.addressLine1 ?? null,
    input?.addressLine2 ?? null,
    input?.city && input?.province && input?.postalCode
      ? `${input.city}, ${input.province} ${input.postalCode}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return {
    name,
    addressLine1: input?.addressLine1?.trim() || null,
    addressLine2: input?.addressLine2?.trim() || null,
    city: input?.city?.trim() || null,
    province: input?.province?.trim() || null,
    postalCode: input?.postalCode?.trim() || null,
    addressLines,
  };
}

function resolveBureauRecipient(row: IssueRow, input?: DisputePacketRecipientInput): RecipientRecord {
  if (input?.name || input?.addressLine1) {
    return recipientFromInput(input, row.bureauName || "Credit Bureau");
  }

  const hardcoded = row.bureauName ? getBureauDisputeAddress(row.bureauName) : null;
  if (hardcoded) {
    return {
      name: hardcoded.bureauName,
      addressLine1: hardcoded.addressLine1,
      addressLine2: hardcoded.department,
      city: hardcoded.city,
      province: hardcoded.province,
      postalCode: hardcoded.postalCode,
      addressLines: [
        hardcoded.department,
        hardcoded.addressLine1,
        `${hardcoded.city}, ${hardcoded.province} ${hardcoded.postalCode}`,
      ],
    };
  }

  return {
    name: row.bureauName || "Credit Bureau",
    addressLine1: row.bureauAddressLine1,
    addressLine2: row.bureauAddressLine2,
    city: row.bureauCity,
    province: row.bureauProvince,
    postalCode: row.bureauPostalCode,
    addressLines: [
      row.bureauAddressLine1,
      row.bureauAddressLine2,
      row.bureauCity && row.bureauProvince && row.bureauPostalCode
        ? `${row.bureauCity}, ${row.bureauProvince} ${row.bureauPostalCode}`
        : null,
    ].filter((line): line is string => Boolean(line)),
  };
}

function resolveCollectionRecipient(rows: IssueRow[], input?: DisputePacketRecipientInput): RecipientRecord {
  const collectionNames = Array.from(
    new Set(rows.map((row) => row.collectionAgencyName?.trim()).filter((name): name is string => Boolean(name)))
  );

  if (!input?.name && collectionNames.length > 1) {
    throw new BusinessRuleError("Select collection items for one collection agency at a time.");
  }

  const fallbackName = collectionNames[0] ?? "Collection agency";
  if (!input?.name && fallbackName === "Collection agency") {
    throw new BusinessRuleError("A collection agency name is required for a collection agency packet.");
  }

  return recipientFromInput(input, fallbackName);
}

function buildConsumer(row: IssueRow) {
  const cityLine =
    row.consumerCity && row.consumerProvince && row.consumerPostalCode
      ? `${row.consumerCity}, ${row.consumerProvince} ${row.consumerPostalCode}`
      : null;

  return {
    name: firstKnownText([row.consumerFullName, row.userDisplayName]) ?? "Consumer",
    address: [row.consumerAddressLine1, row.consumerAddressLine2, cityLine].filter((line): line is string => Boolean(line)),
    phone: row.consumerPhone,
    email: row.consumerEmail ?? row.userEmail,
  };
}

function assertRowsCanBuild(user: User, rows: IssueRow[], input: DisputePacketBuildInput): void {
  if (rows.length === 0) {
    throw new BusinessRuleError("No disputed items were found.", 404);
  }

  const missingIds = input.selectedIssueIds.filter((id) => !rows.some((row) => row.issueId === id));
  if (missingIds.length > 0) {
    throw new BusinessRuleError(`Disputed item not found: ${missingIds[0]}`, 404);
  }

  const ownerIds = Array.from(new Set(rows.map((row) => row.userId).filter((id): id is number => typeof id === "number")));
  if (ownerIds.length !== 1) {
    throw new BusinessRuleError("Select disputed items for one consumer at a time.");
  }

  if (user.role !== "admin" && ownerIds[0] !== user.id) {
    throw new BusinessRuleError("Unauthorized access to disputed items.", 403);
  }

  if (input.packetType === "credit_bureau") {
    const bureauIds = Array.from(new Set(rows.map((row) => row.bureauId).filter((id): id is number => typeof id === "number")));
    if (!input.recipientBureauId && bureauIds.length > 1) {
      throw new BusinessRuleError("Select disputed items from one credit bureau at a time.");
    }
    if (input.recipientBureauId && rows.some((row) => row.bureauId && row.bureauId !== input.recipientBureauId)) {
      throw new BusinessRuleError("Selected items do not match the requested credit bureau.");
    }
  }

  if (input.packetType === "collection_agency" && rows.some((row) => !packetTypesForRow(row).includes("collection_agency"))) {
    throw new BusinessRuleError("One or more selected items is not available for a collection agency packet.");
  }
}

async function getIssueRows(issueIds: number[]): Promise<IssueRow[]> {
  return db
    .selectFrom("creditorObligationTest as issue")
    .innerJoin("tradeline as tradeline", "tradeline.id", "issue.tradelineId")
    .leftJoin("users as users", "users.id", "tradeline.userId")
    .leftJoin("userAccount as userAccount", "userAccount.userId", "tradeline.userId")
    .leftJoin("bureau as bureau", "bureau.id", "tradeline.bureauId")
    .leftJoin("creditor as creditor", "creditor.id", "tradeline.creditorId")
    .leftJoin("reportArtifact as reportArtifact", "reportArtifact.id", "tradeline.reportArtifactId")
    .select([
      "issue.id as issueId",
      "issue.userExplanation as issueUserExplanation",
      "issue.recommendedAction as issueRecommendedAction",
      "issue.violationCategory as issueViolationCategory",
      "issue.disputeVector as issueDisputeVector",
      "issue.technicalDetails as issueTechnicalDetails",
      "issue.userStatus as issueUserStatus",
      "tradeline.id as tradelineId",
      "tradeline.userId as userId",
      "users.email as userEmail",
      "users.displayName as userDisplayName",
      "userAccount.fullName as consumerFullName",
      "userAccount.email as consumerEmail",
      "userAccount.addressLine1 as consumerAddressLine1",
      "userAccount.addressLine2 as consumerAddressLine2",
      "userAccount.city as consumerCity",
      "userAccount.province as consumerProvince",
      "userAccount.postalCode as consumerPostalCode",
      "userAccount.phone as consumerPhone",
      "bureau.id as bureauId",
      "bureau.name as bureauName",
      "bureau.addressLine1 as bureauAddressLine1",
      "bureau.addressLine2 as bureauAddressLine2",
      "bureau.city as bureauCity",
      "bureau.province as bureauProvince",
      "bureau.postalCode as bureauPostalCode",
      "creditor.name as creditorName",
      "tradeline.accountNumber as accountNumber",
      "tradeline.accountType as accountType",
      "tradeline.status as status",
      "tradeline.balance as balance",
      "tradeline.currentBalance as currentBalance",
      "tradeline.creditLimit as creditLimit",
      "tradeline.highCredit as highCredit",
      "tradeline.amountPastDue as amountPastDue",
      "tradeline.openedDate as openedDate",
      "tradeline.dateClosed as dateClosed",
      "tradeline.dateOfFirstDelinquency as dateOfFirstDelinquency",
      "tradeline.dateOfLastPayment as dateOfLastPayment",
      "tradeline.lastActivityDate as lastActivityDate",
      "tradeline.lastReportedDate as lastReportedDate",
      "tradeline.collectionAgencyName as collectionAgencyName",
      "tradeline.originalCreditorName as originalCreditorName",
      "tradeline.isCollectionAccount as isCollectionAccount",
      "tradeline.reportArtifactId as reportArtifactId",
      "reportArtifact.reportDate as reportDate",
      "tradeline.sourceText as sourceText",
    ])
    .where("issue.id", "in", issueIds)
    .execute() as Promise<IssueRow[]>;
}

export async function getDisputePacketCandidates(
  user: User,
  input: { packetType?: DisputePacketType; limit?: number } = {},
): Promise<DisputePacketCandidate[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  let query = db
    .selectFrom("creditorObligationTest as issue")
    .innerJoin("tradeline as tradeline", "tradeline.id", "issue.tradelineId")
    .leftJoin("users as users", "users.id", "tradeline.userId")
    .leftJoin("userAccount as userAccount", "userAccount.userId", "tradeline.userId")
    .leftJoin("bureau as bureau", "bureau.id", "tradeline.bureauId")
    .leftJoin("creditor as creditor", "creditor.id", "tradeline.creditorId")
    .leftJoin("reportArtifact as reportArtifact", "reportArtifact.id", "tradeline.reportArtifactId")
    .select([
      "issue.id as issueId",
      "issue.userExplanation as issueUserExplanation",
      "issue.recommendedAction as issueRecommendedAction",
      "issue.violationCategory as issueViolationCategory",
      "issue.disputeVector as issueDisputeVector",
      "issue.technicalDetails as issueTechnicalDetails",
      "issue.userStatus as issueUserStatus",
      "tradeline.id as tradelineId",
      "tradeline.userId as userId",
      "users.email as userEmail",
      "users.displayName as userDisplayName",
      "userAccount.fullName as consumerFullName",
      "userAccount.email as consumerEmail",
      "userAccount.addressLine1 as consumerAddressLine1",
      "userAccount.addressLine2 as consumerAddressLine2",
      "userAccount.city as consumerCity",
      "userAccount.province as consumerProvince",
      "userAccount.postalCode as consumerPostalCode",
      "userAccount.phone as consumerPhone",
      "bureau.id as bureauId",
      "bureau.name as bureauName",
      "bureau.addressLine1 as bureauAddressLine1",
      "bureau.addressLine2 as bureauAddressLine2",
      "bureau.city as bureauCity",
      "bureau.province as bureauProvince",
      "bureau.postalCode as bureauPostalCode",
      "creditor.name as creditorName",
      "tradeline.accountNumber as accountNumber",
      "tradeline.accountType as accountType",
      "tradeline.status as status",
      "tradeline.balance as balance",
      "tradeline.currentBalance as currentBalance",
      "tradeline.creditLimit as creditLimit",
      "tradeline.highCredit as highCredit",
      "tradeline.amountPastDue as amountPastDue",
      "tradeline.openedDate as openedDate",
      "tradeline.dateClosed as dateClosed",
      "tradeline.dateOfFirstDelinquency as dateOfFirstDelinquency",
      "tradeline.dateOfLastPayment as dateOfLastPayment",
      "tradeline.lastActivityDate as lastActivityDate",
      "tradeline.lastReportedDate as lastReportedDate",
      "tradeline.collectionAgencyName as collectionAgencyName",
      "tradeline.originalCreditorName as originalCreditorName",
      "tradeline.isCollectionAccount as isCollectionAccount",
      "tradeline.reportArtifactId as reportArtifactId",
      "reportArtifact.reportDate as reportDate",
      "tradeline.sourceText as sourceText",
    ])
    .where("issue.userStatus", "!=", "dismissed")
    .orderBy("issue.detectedAt", "desc")
    .orderBy("issue.id", "desc")
    .limit(limit);

  if (user.role !== "admin") {
    query = query.where("tradeline.userId", "=", user.id);
  }

  const rows = await query.execute() as IssueRow[];
  return rows
    .map((row) => candidateFromRow(row, input.packetType ?? "credit_bureau"))
    .filter((candidate) => !input.packetType || candidate.packetTypes.includes(input.packetType));
}

export async function buildDisputePacketPreview(
  user: User,
  input: DisputePacketBuildInput,
): Promise<{
  packet: SimpleDisputePacketContent;
  recipientRecord: RecipientRecord;
  ownerUserId: number;
  firstTradelineId: number;
  bureauId: number | null;
}> {
  const uniqueIssueIds = Array.from(new Set(input.selectedIssueIds.map((id) => Number(id))));
  const rows = await getIssueRows(uniqueIssueIds);
  assertRowsCanBuild(user, rows, { ...input, selectedIssueIds: uniqueIssueIds });

  const firstRow = rows[0];
  const ownerUserId = Number(firstRow.userId);
  const recipientRecord =
    input.packetType === "collection_agency"
      ? resolveCollectionRecipient(rows, input.recipient)
      : resolveBureauRecipient(firstRow, input.recipient);
  const reportDate = rows.find((row) => row.reportDate)?.reportDate ?? null;
  const reportType =
    input.packetType === "collection_agency"
      ? "Collection agency account information"
      : `${firstRow.bureauName || "Credit Bureau"} credit report`;

  const packet = buildSimpleDisputePacketContent({
    packetType: input.packetType,
    reportType,
    reportDate,
    recipient: {
      type: input.packetType,
      name: recipientRecord.name,
      address: addressLinesFromRecipient(recipientRecord),
    },
    consumer: buildConsumer(firstRow),
    disputedItems: rows.map((row) => toDisputedItemInput(row, input.packetType)),
    reportArtifactIds: rows.map((row) => row.reportArtifactId),
    generatedByUserId: user.id,
  });

  return {
    packet,
    recipientRecord,
    ownerUserId,
    firstTradelineId: firstRow.tradelineId,
    bureauId: input.packetType === "credit_bureau" ? (input.recipientBureauId ?? firstRow.bureauId) : null,
  };
}

export async function createDisputePacketRecord(
  user: User,
  input: DisputePacketBuildInput,
): Promise<{ packetId: number; packet: SimpleDisputePacketContent; status: string }> {
  const preview = await buildDisputePacketPreview(user, input);
  const now = new Date();
  const packetType = input.packetType === "collection_agency" ? "collection_agency_dispute" : "credit_bureau_dispute";

  const inserted = await db.transaction().execute(async (trx) => {
    const packet = await trx
      .insertInto("packet")
      .values({
        userId: preview.ownerUserId,
        tradelineId: preview.firstTradelineId,
        bureauId: preview.bureauId,
        type: packetType,
        status: "generated",
        processingStatus: "completed",
        content: JSON.stringify(preview.packet),
        terminalLabel: preview.packet.title,
        letterDate: now,
        recipientName: preview.recipientRecord.name,
        recipientAddressLine1: preview.recipientRecord.addressLine1,
        recipientAddressLine2: preview.recipientRecord.addressLine2,
        recipientCity: preview.recipientRecord.city,
        recipientProvince: preview.recipientRecord.province,
        recipientPostalCode: preview.recipientRecord.postalCode,
        region: "CA",
      })
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    const eventData = {
      packetId: packet.id,
      packetType,
      selectedIssueIds: preview.packet.metadata.selectedIssueIds,
      generatedAt: now.toISOString(),
    };

    await trx
      .insertInto("evidenceEvent")
      .values({
        packetId: packet.id,
        eventType: "PACKET_GENERATED",
        description: `${preview.packet.title} generated from selected report issue(s).`,
        previousHash: null,
        currentHash: hashEvent(eventData),
        at: now,
        region: "CA",
      })
      .execute();

    await trx
      .insertInto("auditLog")
      .values({
        actionType: "PACKET_GENERATED",
        entityType: "PACKET",
        entityId: packet.id,
        userId: user.id,
        details: {
          packetType,
          ownerUserId: preview.ownerUserId,
          selectedIssueIds: preview.packet.metadata.selectedIssueIds,
        } as any,
        status: "SUCCESS",
        timestamp: now,
        region: "CA",
      })
      .execute();

    return packet;
  });

  return {
    packetId: inserted.id,
    packet: preview.packet,
    status: inserted.status ?? "generated",
  };
}
