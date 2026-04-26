import { validateOrigin } from "./domainGuard";
import { OriginNotAllowedError } from "./endpointErrorHandler";

export async function assertOriginAllowed(request: Request): Promise<void> {
  const guardResult = await validateOrigin(request);
  if (!guardResult.valid && guardResult.mode === "enforce") {
    throw new OriginNotAllowedError();
  }
}
