import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { runParserLabStage } from "../../helpers/parserLabStage";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./run_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    const isPdf =
      input.mimeType === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      throw new BusinessRuleError("Unsupported file type. Please upload a PDF.");
    }

    const output = await runParserLabStage({
      fileName: input.fileName ?? "credit-report.pdf",
      mimeType: input.mimeType ?? "application/pdf",
      bytesBase64: input.bytesBase64 ?? "",
      allowAiFallback: false,
    });

    return new Response(JSON.stringify(output satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
