import { setServerSession } from "../../helpers/getSetServerSession";
import { User } from "../../helpers/User";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user, session } = await getServerUserSession(request);

    // Create response with user data
    const response = Response.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        organizationId: user.organizationId,
        emailVerified: user.emailVerified,
        role: user.role,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        trialEnd: user.trialEnd,
        termsAcceptedAt: user.termsAcceptedAt,
        termsAcceptedVersion: user.termsAcceptedVersion,
        currentTermsVersion: user.currentTermsVersion,
      } satisfies User,
    });

    // Refresh the session cookie with updated lastAccessed timestamp
    await setServerSession(response, {
      id: session.id,
      createdAt: session.createdAt,
      lastAccessed: session.lastAccessed.getTime(),
    });

    return response;
  } catch (error) {
    return handleEndpointError(error);
  }
}
