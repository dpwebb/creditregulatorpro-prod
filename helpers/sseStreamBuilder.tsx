/**
 * Helper for building Server-Sent Events (SSE) streaming responses.
 * Used to keep CloudFront connections alive during long-running AI operations.
 */

export interface SSEProgressEvent {
  type: "progress";
  stage: string;
  message?: string;
  percent?: number;
}

export interface SSECompleteEvent {
  type: "complete";
  data: any;
}

export interface SSEErrorEvent {
  type: "error";
  error: string;
  code?: string;
}

export type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent;

/**
 * Formats data as an SSE message.
 */
export function formatSSE(data: SSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates a ReadableStream that sends SSE-formatted events.
 */
export function createSSEStream(
  producer: (send: (event: SSEEvent) => void) => Promise<void>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(formatSSE(event)));
      };

      try {
        await producer(send);
        controller.close();
      } catch (error) {
        const errorEvent: SSEErrorEvent = {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          code: "STREAM_ERROR",
        };
        controller.enqueue(encoder.encode(formatSSE(errorEvent)));
        controller.close();
      }
    },
  });
}

/**
 * Creates an SSE Response with proper headers.
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Sends a heartbeat event to keep the connection alive.
 */
export function createHeartbeat(): SSEProgressEvent {
  return {
    type: "progress",
    stage: "heartbeat",
    message: "Processing...",
  };
}