/**
 * RBAC Persona-to-Role Mapping System
 * 
 * The application uses a three-tier persona system mapped to specific database roles:
 * 
 * 1. Individual User (Persona) -> "user" (Role)
 *    - Typical users.
 *    - Can access personal dashboards and standard features.
 * 
 * 2. Admin User (Persona) -> "admin" (Role)
 *    - Internal staff or system administrators.
 *    - Full access to system settings, user management, and global data.
 * 
 * 3. Support Agent (Persona) -> "support" (Role)
 *    - Support staff handling customer inquiries.
 *    - Can access user support tickets and limited user data.
 * 
 * Access Control Matrix:
 * | Feature / Area      | Individual | Admin | Support |
 * |-------------------|------------|-------|---------|
 * | Personal Profile   | ✅         | ✅    | ✅      |
 * | Org Management     | ❌         | ✅    | ❌      |
 * | System Config      | ❌         | ✅    | ❌      |
 * | Support Tickets    | ❌         | ✅    | ✅      |
 * 
 * Note: If you update this type, make sure to also update:
 * - components/ProtectedRoute
 * - endpoints/auth/login_with_password_POST
 * - endpoints/auth/register_with_password_POST
 * - endpoints/auth/session_GET
 * - helpers/getServerUserSession
 */

export interface User {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  organizationId: number | null;
  /**
   * Whether the user's email has been verified.
   * Sourced from the users table.
   */
  emailVerified: boolean;
  /**
   * The technical role identifier stored in the database.
   * Maps to the personas described above.
   */
  role: "admin" | "user" | "support";
  /**
   * The user's current subscription plan, if any.
   * Populated via LEFT JOIN with the subscriptions table.
   */
  subscriptionPlan: string | null;
  /**
   * The user's current subscription status, if any.
   * Populated via LEFT JOIN with the subscriptions table.
   */
  subscriptionStatus: string | null;
  /**
   * The user's trial end date as an ISO string, if any.
   * Populated via LEFT JOIN with the subscriptions table.
   */
  trialEnd: string | null;
  /**
   * The date the user accepted the terms of service, as an ISO string, if any.
   * Populated via LEFT JOIN with the userAccount table.
   * Admins are always considered to have accepted terms.
   */
  termsAcceptedAt: string | null;
  /**
   * The terms version the user accepted, if any.
   * Populated via LEFT JOIN with the userAccount table.
   * For admin/support, set to the currentTermsVersion so they auto-pass version checks.
   */
  termsAcceptedVersion: string | null;
  /**
   * The current system terms version from system_settings (key = "terms_version").
   * Null if not configured.
   */
  currentTermsVersion: string | null;
}