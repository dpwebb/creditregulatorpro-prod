import { schema, OutputType } from "./approve_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { Json } from "../../helpers/schema";
import CryptoJS from "crypto-js";
import { findOrCreateCreditor } from "../../helpers/creditorMatcher";
import { validateTradeline, TL } from "../../helpers/metro2";
import { logValidation } from "../../helpers/metro2ValidationLogger";
import { getRulesByYear } from "../../helpers/metro2ValidationRules";
import { logAudit, logUpload } from "../../helpers/auditLogger";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { normalizeCreditReportAmount } from "../../helpers/creditReportNumberSanitizer";
import { buildReportArtifactStorageMetadata, storeReportArtifactPdf } from "../../helpers/reportArtifactStorage";

function normalizeAccountNumberForLookup(accountNumber: string | null | undefined): string | null {
  const normalized = (accountNumber || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (
    !normalized ||
    normalized === "UNKNOWN" ||
    normalized === "NA" ||
    normalized === "NOTREPORTED"
  ) {
    return null;
  }
  return normalized;
}

export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const sessionData = await getServerUserSession(request);
    const user = sessionData.user;
    const isAuthenticatedUpload = true;
    console.log(`[Review/Approve] Authenticated approval from user ${user.id} (${user.email})`);

    // Create or find userAccount (profile table) - prefer lookup by userId, fall back to email
    let userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!userAccount) {
      userAccount = await db
        .selectFrom("userAccount")
        .selectAll()
        .where("email", "=", user.email)
        .executeTakeFirst();
    }

    if (!userAccount) {
      console.log(`[Review/Approve] Creating new user account profile for email: ${user.email}`);
      userAccount = await db
        .insertInto("userAccount")
        .values({
          userId: user.id,
          email: user.email,
          region: input.region,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // Persist Tradelines - use users.id for tradeline.userId
    const tradelineIds: number[] = [];
    const parsedTradelines = input.tradelines;

    if (parsedTradelines.length > 0) {
      console.log(`[Review/Approve] Persisting ${parsedTradelines.length} tradelines to database for user ${user.id}`);
      
      for (const parsedTradeline of parsedTradelines) {
        const creditorId = await findOrCreateCreditor(parsedTradeline.creditorName);
        const accountNumberForDb = parsedTradeline.accountNumber?.trim() || "Not reported";
        const searchableAccountNumber = normalizeAccountNumberForLookup(accountNumberForDb);

        // Check if tradeline already exists for this user and account number.
        // Some bureau reports omit account numbers, so blank/Unknown values must not
        // merge unrelated same-user accounts.
        // Use users.id (not userAccount.id) because tradeline.userId FK points to users table
        const existingTradeline = searchableAccountNumber
          ? await db
              .selectFrom("tradeline")
              .select("id")
              .where("userId", "=", user.id)
              .where("accountNumber", "=", accountNumberForDb)
              .executeTakeFirst()
          : null;

        if (existingTradeline) {
          console.log(`[Review/Approve] Updating existing tradeline ${existingTradeline.id} for account ${accountNumberForDb}`);

          const currentBalance = normalizeCreditReportAmount(parsedTradeline.balance, "tradeline.currentBalance");
          const amountPastDue = normalizeCreditReportAmount(parsedTradeline.amounts.pastDue, "tradeline.amountPastDue");
          const highCredit = normalizeCreditReportAmount(parsedTradeline.amounts.high, "tradeline.highCredit");
          const updateValues: Record<string, unknown> = {
            accountType: parsedTradeline.accountType,
            status: parsedTradeline.status,
            openedDate: parsedTradeline.dates.opened ?? null,
            dateClosed: parsedTradeline.dates.closed ?? null,
            dateOfFirstDelinquency: parsedTradeline.dates.dofd ?? null,
            originalCreditorName: parsedTradeline.creditorName,
            creditorId: creditorId,
          };
          if (currentBalance !== null) updateValues.currentBalance = currentBalance;
          if (amountPastDue !== null) updateValues.amountPastDue = amountPastDue;
          if (highCredit !== null) updateValues.highCredit = highCredit;
          
          await db
            .updateTable("tradeline")
            .set(updateValues)
            .where("id", "=", existingTradeline.id)
            .execute();
          tradelineIds.push(existingTradeline.id);
        } else {
          // Insert new tradeline - use users.id for userId
          console.log(`[Review/Approve] Inserting new tradeline for account ${accountNumberForDb}`);

          const currentBalance = normalizeCreditReportAmount(parsedTradeline.balance, "tradeline.currentBalance");
          const amountPastDue = normalizeCreditReportAmount(parsedTradeline.amounts.pastDue, "tradeline.amountPastDue");
          const highCredit = normalizeCreditReportAmount(parsedTradeline.amounts.high, "tradeline.highCredit");
          
          const newTradeline = await db
            .insertInto("tradeline")
            .values({
              userId: user.id,
              accountNumber: accountNumberForDb,
              accountType: parsedTradeline.accountType,
              status: parsedTradeline.status,
              currentBalance,
              amountPastDue,
              highCredit,
              openedDate: parsedTradeline.dates.opened ?? null,
              dateClosed: parsedTradeline.dates.closed ?? null,
              dateOfFirstDelinquency: parsedTradeline.dates.dofd ?? null,
              dateOfLastPayment: null,
              paymentHistoryProfile: null,
              creditorId: creditorId,
              bureauId: null,
              originalCreditorName: parsedTradeline.creditorName,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          tradelineIds.push(newTradeline.id);
        }
      }
      
      console.log(`[Review/Approve] Persisted ${tradelineIds.length} tradelines with IDs: ${tradelineIds.join(", ")}`);
    }

    // Create Report Artifact - use user.id (from users table) for consistency
    const sha256 = CryptoJS.SHA256(input.bytesBase64).toString(CryptoJS.enc.Hex);
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const crrgYear = new Date().getFullYear();
    const ruleSet = getRulesByYear(crrgYear);
    const validationRulesApplied = ruleSet.rules.map(rule => rule.ruleName);
    const storedPdf = await storeReportArtifactPdf({
      bytesBase64: input.bytesBase64,
      userId: user.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });

    const artifactRecord = await db
      .insertInto("reportArtifact")
      .values({
        userId: user.id,
        storageUrl: storedPdf.storageUrl,
        sha256: sha256,
        expiresAt: expiresAt,
        region: input.region,
        reportDate: now,
        data: JSON.parse(JSON.stringify({
          fileName: input.fileName,
          mimeType: input.mimeType,
          parsedTradelines: parsedTradelines,
          tradelineIds: tradelineIds,
          reviewSessionId: input.reviewSessionId,
          isAuthenticatedUpload: isAuthenticatedUpload,
          ...buildReportArtifactStorageMetadata(storedPdf),
        })) as Json,
        artifactType: input.mimeType,
        validationRulesApplied: JSON.stringify(validationRulesApplied),
        metro2Version: "2.0",
        crrgYear
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Metro2 Validation
    if (parsedTradelines.length > 0) {
      for (let i = 0; i < parsedTradelines.length; i++) {
        const parsedTradeline = parsedTradelines[i];
        const tradelineId = tradelineIds[i] ?? undefined;
        const tl: TL = {
          amounts: {
            high: parsedTradeline.amounts.high ?? 0,
            current: parsedTradeline.balance,
            pastDue: parsedTradeline.amounts.pastDue ?? 0,
          },
          dates: {
            opened: parsedTradeline.dates.opened ?? null,
            reported: parsedTradeline.dates.reported ?? null,
            closed: parsedTradeline.dates.closed ?? null,
            dofd: parsedTradeline.dates.dofd ?? null,
            chargeOff: null,
          },
          status: parsedTradeline.status,
          remarkCodes: parsedTradeline.remarkCodes,
          payment: { scheduledMonthly: 0 },
        };
        
        const validationResults = validateTradeline(tl, String(crrgYear));
        
        for (const result of validationResults) {
          if (!result.valid) {
            await logValidation({
              tradelineId: tradelineId,
              ruleName: result.ruleName,
              category: result.category,
              severity: result.severity as "ERROR" | "WARNING" | "INFO",
              expectedValue: result.expectedValue,
              actualValue: result.actualValue,
              message: result.message ?? "Validation failed",
              region: input.region,
            });
          }
        }
      }
    }

    // Audit Logging - use user.id from users table
    await logUpload(
      user.id,
      artifactRecord.id,
      input.fileName,
      request
    );

    // Log the approval action specifically
    await logAudit({
      action: "UPDATE",
      entityType: "REPORT_ARTIFACT",
      entityId: artifactRecord.id,
      userId: user.id,
      details: { 
        reviewSessionId: input.reviewSessionId,
        action: "REVIEW_APPROVED",
        tradelinesCount: tradelineIds.length,
        isAuthenticatedUpload: isAuthenticatedUpload
      },
      status: "SUCCESS",
      request
    });

    return new Response(
      JSON.stringify({
        ok: true,
        storageUrl: String(artifactRecord.id),
        tradelineIds: tradelineIds
      } satisfies OutputType),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error in review/approve_POST:", error);
    return handleEndpointError(error);
  }
}
