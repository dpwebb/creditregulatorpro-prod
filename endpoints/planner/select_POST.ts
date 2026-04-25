import { schema, OutputType } from "./select_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import {
  getDataDrivenVectorRecommendation,
  enhancedPressureScore,
} from "../../helpers/strategyFeedback";
import { calculateDeadline, createDeadlineEvent } from "../../helpers/deadlineCalculator";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";


export async function handle(request: Request) {
  try {
    // 1. Authenticate request and extract userId
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 2. Fetch the tradeline including bureauId and creditorId
    const tradeline = await db
      .selectFrom("tradeline")
      .select([
        "id",
        "lastDisputeVectors",
        "accountNumber",
        "bureauId",
        "creditorId",
      ])
      .where("id", "=", input.tradelineId)
      .executeTakeFirst();

    if (!tradeline) {
      throw new Error(`Tradeline with id ${input.tradelineId} not found`);
    }

    // Parse lastDisputeVectors from JSONB (initialize as empty array if null/undefined)
    let lastVectors: string[] = [];
    if (tradeline.lastDisputeVectors) {
      const parsed = tradeline.lastDisputeVectors as unknown;
      if (Array.isArray(parsed)) {
        lastVectors = parsed.filter((v): v is string => typeof v === "string");
      }
    }

    const mostRecentVector = lastVectors.length > 0 ? lastVectors[0] : null;

    console.log("[planner/select] Tradeline rotation state:", {
      tradelineId: input.tradelineId,
      lastVectors,
      mostRecentVector,
      bureauId: tradeline.bureauId,
      creditorId: tradeline.creditorId,
    });

    // 3. Fetch data-driven recommendation using historical success rates
    let recommendation: OutputType["recommendation"] | null = null;
    try {
      const vectorRec = await getDataDrivenVectorRecommendation(
        user.id,
        input.tradelineId
      );
      recommendation = {
        recommendedVector: vectorRec.recommendedVector,
        confidence: vectorRec.confidence,
        reasoning: vectorRec.reasoning,
      };
      console.log("[planner/select] Data-driven recommendation:", recommendation);
    } catch (recError) {
      // Non-fatal: log and continue without recommendation
      console.warn(
        "[planner/select] Could not compute data-driven recommendation, proceeding without it:",
        recError instanceof Error ? recError.message : recError
      );
    }

    // 4. Query all NEW obligation instances for the tradeline
    const instances = await db
      .selectFrom("obligationInstance")
      .selectAll()
      .where("tradelineId", "=", input.tradelineId)
      .where("state", "=", "OBLIGATION_PENDING")
      .execute();

    if (instances.length === 0) {
      throw new Error("No OBLIGATION_PENDING obligation instances found for this tradeline");
    }

    // 5. Filter out instances whose disputeVector matches the most recently used vector
    const eligibleInstances = instances.filter((instance) => {
      if (!instance.disputeVector || !mostRecentVector) {
        return true;
      }
      const shouldSkip = instance.disputeVector === mostRecentVector;
      if (shouldSkip) {
        console.log(
          `[planner/select] Skipping instance ${instance.id} with vector '${instance.disputeVector}' (same as most recent)`
        );
      }
      return !shouldSkip;
    });

    if (eligibleInstances.length === 0) {
      console.warn(
        `[planner/select] All ${instances.length} NEW instances filtered out due to rotation rules`
      );
      throw new Error(
        "No eligible obligation instances after applying rotation strategy. All instances use the most recently used dispute vector."
      );
    }

    console.log(
      `[planner/select] ${eligibleInstances.length} of ${instances.length} instances are eligible after rotation filtering`
    );

    // 6. Score each eligible instance using enhancedPressureScore
    const RECOMMENDATION_BOOST_FACTOR = 1.3;

    const scored: Array<{ instanceId: number; score: number; disputeVector: string | null }> = [];

    for (const instance of eligibleInstances) {
      const enhancedResult = await enhancedPressureScore({
        userId: user.id,
        severity: 1,
        likelihood: 1,
        leverage: 1,
        clockShortness: 1,
        creditorId: tradeline.creditorId ?? null,
        bureauId: tradeline.bureauId ?? null,
      });

      let score = enhancedResult.score;

      // 7. Boost the recommended vector's instance score
      if (
        recommendation &&
        instance.disputeVector === recommendation.recommendedVector
      ) {
        const boostedScore = score * RECOMMENDATION_BOOST_FACTOR;
        console.log(
          `[planner/select] Boosting instance ${instance.id} (vector '${instance.disputeVector}') score: ${score} -> ${boostedScore}`
        );
        score = boostedScore;
      }

      await db
        .updateTable("obligationInstance")
        .set({ pressureScore: score.toString() })
        .where("id", "=", instance.id)
        .execute();

      scored.push({
        instanceId: instance.id,
        score,
        disputeVector: instance.disputeVector,
      });
    }

    // Select the instance with the highest score
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const selectedInstanceId = best.instanceId;
    const selectedVector = best.disputeVector;

    console.log("[planner/select] Selected instance:", {
      selectedInstanceId,
      selectedVector,
      score: best.score,
    });

    // 8. Calculate deadline and update the selected instance to WAITING
    const now = new Date();
    const { deadline: responseDeadline } = calculateDeadline(
      now,
      "CA",
      false
    );

    await db
      .updateTable("obligationInstance")
      .set({
        state: "CHALLENGED",
        challengeSentDate: now,
        responseDeadline: responseDeadline,
      })
      .where("id", "=", selectedInstanceId)
      .execute();

    // 9. Create deadline event for tracking
    await createDeadlineEvent({
      obligationInstanceId: selectedInstanceId,
      eventType: "RESPONSE_DUE",
      deadline: responseDeadline,
      title: `Response Due: ${tradeline.accountNumber}`,
      description: `Awaiting bureau response for ${selectedVector || "unknown"} challenge`,
      region: "CA",
    });

    console.log("[planner/select] Created deadline tracking:", {
      instanceId: selectedInstanceId,
      challengeSentDate: now,
      responseDeadline: responseDeadline,
    });

    // 10. Update tradeline's lastDisputeVectors by prepending the selected vector (keep last 5)
    if (selectedVector) {
      const updatedVectors = [selectedVector, ...lastVectors].slice(0, 5);
      await db
        .updateTable("tradeline")
        .set({ lastDisputeVectors: JSON.stringify(updatedVectors) })
        .where("id", "=", input.tradelineId)
        .execute();

      console.log("[planner/select] Updated tradeline rotation history:", {
        tradelineId: input.tradelineId,
        selectedVector,
        newHistory: updatedVectors,
      });
    } else {
      console.warn(
        `[planner/select] Selected instance ${selectedInstanceId} has no disputeVector, skipping rotation history update`
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        selectedInstanceId,
        disputeVector: selectedVector,
        recommendation,
      } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in planner/select_POST:", error);
    return handleEndpointError(error);
  }
}