import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "../endpoints/auth/session_GET.schema";
import { postLogout } from "../endpoints/auth/logout_POST.schema";
import { User } from "./User";
import { isAdmin, hasRole } from "./userRoleUtils";
import { useNavigate } from "react-router-dom";

// React Query key for auth session. Make sure to optimistically update user infos using this.
export const AUTH_QUERY_KEY = ["auth", "session"] as const;

// Do not use this state in login/register UI because it's irrelevant. Only use it in UI that requires authentication.
// For pages that requires authentication only in parts of the UI (e.g. typical home page with a user avatar), the loading
// state should not apply to the full page, only to the parts that require authentication.
// Also, global context providers should not be blocked on auth states as it will block the whole page.
type AuthState =
  | {
      // Make sure to display a nice loading state UI when loading authentication state
      type: "loading";
    }
  | {
      type: "authenticated";
      user: User;
    }
  | {
      // Make sure to redirect to login or show auth error UI
      type: "unauthenticated";
      errorMessage?: string;
    };

type AuthContextType = {
  // Use this to display the correct UI based on auth state
  authState: AuthState;
  // Notify the auth provider that we have logged in
  onLogin: (user: User) => void;
  // Clear the auth state and perform the logout request
  logout: () => Promise<void>;
  // True if current user is admin
  isAdmin: boolean;
  // Current user's role, null if not authenticated
  userRole: "admin" | "user" | "support" | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Add this to components/_globalContextProviders but not any pageLayout files.
// Make sure it's within the QueryClientProvider
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();

  const { data, error, status } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const result = await getSession();
      if ("error" in result) {
        throw new Error(result.error);
      }
      // The session returns a user object which includes the 'role' field.
      // role: "user" -> Individual User
      // role: "admin" -> Admin User
      // role: "support" -> Support Agent
      return result.user;
    },
    retry: 1,
    enabled: true,
    staleTime: Infinity,
  });

  const authState: AuthState =
    status === "pending"
      ? { type: "loading" }
      : status === "error"
        ? {
            type: "unauthenticated",
            errorMessage:
              error instanceof Error ? error.message : "Session check failed",
          }
        : data
          ? { type: "authenticated", user: data }
          : { type: "unauthenticated" };

  const logout = useCallback(async () => {
    // Optimistically update UI
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    // Make the actual API call
    await postLogout();
    // Invalidate all queries after login so previous user's state don't corrupt new user state.
    queryClient.resetQueries();
  }, [queryClient]);

  // This should only be used for login. For user profile changes, create separate endpoints and react query hooks
  // and update the data linked to AUTH_QUERY_KEY.
  const onLogin = useCallback(
    (user: User) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    },
    [queryClient]
  );

  const currentUser =
    authState.type === "authenticated" ? authState.user : null;

  const contextValue: AuthContextType = {
    authState,
    logout,
    onLogin,
    isAdmin: isAdmin(currentUser),
    userRole: currentUser?.role ?? null,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Prefer using protectedRoutes instead of this hook unless the route doesn't need to be protected (e.g. login/register)
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a AuthProvider");
  }
  return context;
};

/**
 * Returns true if current user is admin.
 * Returns false during loading or unauthenticated states.
 */
export const useIsAdmin = (): boolean => {
  const { isAdmin: adminStatus } = useAuth();
  return adminStatus;
};

/**
 * Returns true if current user has the specified role.
 * Returns false during loading or unauthenticated states.
 */
export const useHasRole = (role: "admin" | "user" | "support"): boolean => {
  const { authState } = useAuth();
  const currentUser =
    authState.type === "authenticated" ? authState.user : null;
  return hasRole(currentUser, role);
};

/**
 * Hook that ensures current user is admin.
 * Navigates to "/" if user is not admin.
 * Use this in components that should only be accessible to admins.
 */
export const useRequireAdmin = (): void => {
  const { authState, isAdmin: adminStatus } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    // Only check after auth state is resolved (not loading)
    if (authState.type === "loading") {
      return;
    }

    if (!adminStatus) {
      console.log("Access denied: Admin role required. Redirecting to home.");
      navigate("/");
    }
  }, [authState.type, adminStatus, navigate]);
};
