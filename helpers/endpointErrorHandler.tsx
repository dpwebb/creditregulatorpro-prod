import { ZodError } from "zod";
import { NotAuthenticatedError } from "./getSetServerSession";

/**
 * Error class for origin not allowed (CORS or other origin restrictions).
 */
export class OriginNotAllowedError extends Error {
  constructor(
    message: string = "Access denied",
    public readonly statusCode: number = 403
  ) {
    super(message);
    this.name = "OriginNotAllowedError";
  }
}

/**
 * Error class for business rule violations.
 * Accepts a message and an optional HTTP status code (defaults to 400).
 */
export class BusinessRuleError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

/**
 * Shared utility to handle endpoint errors and return standardized JSON Responses.
 * Maps common error types to appropriate HTTP status codes.
 */
export function handleEndpointError(error: unknown): Response {
  const headers = { "Content-Type": "application/json" };

  if (error instanceof NotAuthenticatedError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 401,
      headers,
    });
  }

  if (error instanceof OriginNotAllowedError) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers,
    });
  }

  if (error instanceof BusinessRuleError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode,
      headers,
    });
  }

  if (error instanceof ZodError) {
    const firstErrorMessage = error.errors[0]?.message || "Validation error";
    return new Response(JSON.stringify({ error: firstErrorMessage }), {
      status: 400,
      headers,
    });
  }

  if (error instanceof SyntaxError) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers,
    });
  }

  // Log unhandled server errors
  console.error(
    "Endpoint Error:",
    error instanceof Error ? error.message : error
  );

  return new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status: 500,
    headers,
  });
}