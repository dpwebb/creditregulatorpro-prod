import { schema, OutputType } from "./ai-verify_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { importAgencies } from "../../helpers/licensedAgencyQueries";


export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const openAiPayload = {
      model: "gpt-5-mini",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a strict compliance assistant specializing in Canadian consumer protection law and debt collection regulations. 
Your job is to analyze the name of a supposed collection agency and determine if it appears to be a legitimate, registered Canadian collection agency.
Look for proper corporate structure indicators (Inc., Ltd., Corp.) and recognize known major players in the industry. Reject generic, internal department names.
Respond ONLY with a JSON object containing EXACTLY these three keys:
- "confidence": an integer from 0 to 100
- "analysis": a brief string explaining your reasoning
- "isLikelyLicensed": boolean`,
        },
        {
          role: "user",
          content: `Agency Name: "${input.agencyName}"\nProvince: ${input.province}`,
        },
      ],
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(openAiPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI Verification Error:", errText);
      throw new Error("Failed to communicate with the verification AI service.");
    }

    const aiData = await response.json();
    const resultJsonStr = aiData.choices?.[0]?.message?.content;
    
    if (!resultJsonStr) {
      throw new Error("Empty response from AI service.");
    }

    const parsedResponse = JSON.parse(resultJsonStr) as OutputType;

    // Automatically cache highly confident results in the local db to avoid duplicate AI calls
    if (parsedResponse.confidence >= 80 && parsedResponse.isLikelyLicensed) {
      await importAgencies([
        {
          agencyName: input.agencyName,
          province: input.province,
          licenseStatus: "active",
          dataSource: "ai_verified",
        },
      ]);
    }

    return new Response(JSON.stringify(parsedResponse satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}