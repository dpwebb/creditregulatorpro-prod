import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { runParserLabStage } from "../../helpers/parserLabStage";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./run_POST.schema";
import {
  isScannedPdfUnsupportedError,
  SCANNED_PDF_UNSUPPORTED_CODE,
} from "../../helpers/creditReportPdfEligibility";

const parserLabScannedPdfUnsupportedResponse = () =>
  new Response(
    JSON.stringify({
      error: SCANNED_PDF_UNSUPPORTED_CODE,
      message:
        "This PDF appears to be scanned or image-only. Deterministic OCR did not produce valid credit-report text.",
      action: "Try a text-based credit report PDF or verify OCR support before retrying.",
      stage: "parser_lab",
      sideEffects: "none",
    }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );

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
    if (isScannedPdfUnsupportedError(error)) {
      return parserLabScannedPdfUnsupportedResponse();
    }

    return handleEndpointError(error);
  }
}
