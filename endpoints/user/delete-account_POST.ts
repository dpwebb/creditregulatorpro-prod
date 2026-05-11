import { schema, OutputType } from "./delete-account_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { clearServerSession } from "../../helpers/getSetServerSession";
import { deleteUserAccountCascade } from "../../helpers/userDataDeletion";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== "user") {
      throw new BusinessRuleError("Self-service account deletion is available only for consumer accounts", 403);
    }

    const input = schema.parse(JSON.parse(await request.text()));
    if (input.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new BusinessRuleError("Confirmation email does not match this account", 400);
    }

    const result = await deleteUserAccountCascade({
      userId: user.id,
      email: user.email,
      request,
    });

    const response = new Response(JSON.stringify(result satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    clearServerSession(response);

    return response;
  } catch (error) {
    return handleEndpointError(error);
  }
}
