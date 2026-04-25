import { User } from "./User";

/**
 * User Role Utility Helpers
 * 
 * Persona-to-Role Mapping:
 * - "user"  -> Individual User Persona
 * - "admin" -> Admin User Persona
 * - "support" -> Support Agent Persona
 */

/**
 * Checks if user has admin role.
 * Typically used for elevated privileges (Organization Management or System Admin).
 */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === "admin";
}

/**
 * Checks if user has a specific role.
 * @param role The technical role string ("user" | "admin" | "support")
 */
export function hasRole(
  user: User | null | undefined,
  role: "admin" | "user" | "support"
): boolean {
  if (!user) return false;
  return user.role === role;
}