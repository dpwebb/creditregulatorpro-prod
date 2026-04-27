import { useState, useCallback, useRef } from "react";
import { postAiChat } from "../endpoints/support/ai-chat_POST.schema";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export function useAISupportChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [escalationTicketId, setEscalationTicketId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to prevent overlapping requests or duplicate sends
  const abortControllerRef = useRef<AbortController | null>(null);

  const processStream = async (response: Response) => {
    if (!response.body) throw new Error("No response body available");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        // Keep the last partial segment in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (data.type === "chunk") {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage && lastMessage.role === "assistant") {
                    lastMessage.content += data.content;
                  }
                  return newMessages;
                });
              } else if (data.type === "escalated") {
                setEscalationTicketId(data.ticketId);
              } else if (data.type === "error") {
                setError(data.message || "An unknown error occurred.");
              } else if (data.type === "done") {
                setIsStreaming(false);
              }
            } catch (e) {
              console.warn("Failed to parse SSE line:", line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      setIsStreaming(false);
    }
  };

  const executeChat = useCallback(
    async (newMessages: ChatMessage[], forceEscalate = false) => {
      if (isStreaming) return;
      setError(null);
      setIsStreaming(true);

      // Append a blank assistant message to stream into
      setMessages([...newMessages, { role: "assistant", content: "" }]);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await postAiChat(
          { messages: newMessages, forceEscalate },
          { signal: abortControllerRef.current.signal }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to reach support system.");
        }

        await processStream(response);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // Intentionally aborted
        }
        setError(err instanceof Error ? err.message : "Network error");
        setIsStreaming(false);
      }
    },
    [isStreaming]
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText) return;

      const updatedMessages = [...messages, { role: "user" as MessageRole, content: trimmedText }];
      setMessages(updatedMessages);
      executeChat(updatedMessages, false);
    },
    [messages, executeChat]
  );

  const forceEscalate = useCallback(() => {
    executeChat(messages, true);
  }, [messages, executeChat]);

  const resetChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setIsStreaming(false);
    setEscalationTicketId(null);
    setError(null);
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    messages,
    isStreaming,
    escalationTicketId,
    isOpen,
    error,
    sendMessage,
    forceEscalate,
    resetChat,
    toggleOpen,
  };
}