import React, { useRef, useEffect, useState } from "react";
import { Send, Bot, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAISupportChat } from "../helpers/useAISupportChat";
import { Button } from "./Button";
import styles from "./SupportDashboardChat.module.css";

export const SupportDashboardChat = () => {
  const {
    messages,
    isStreaming,
    escalationTicketId,
    sendMessage,
    forceEscalate,
    error,
  } = useAISupportChat();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, escalationTicketId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  return (
    <div className={styles.container}>
      <div className={styles.messagesArea}>
        {messages.length === 0 && (
          <div className={styles.welcomeState}>
            <div className={styles.welcomeIcon}>
              <Bot size={32} />
            </div>
            <h4>Support Assistant</h4>
            <p>Ask a question about procedures, regulations, or system features.</p>
            
            <div className={styles.suggestions}>
              <button
                onClick={() => sendMessage("How do I handle a dispute response?")}
                className={styles.chip}
              >
                How do I handle a dispute response?
              </button>
              <button
                onClick={() => sendMessage("What are the rules for bankruptcy?")}
                className={styles.chip}
              >
                What are the rules for bankruptcy?
              </button>
              <button
                onClick={() => sendMessage("How to update user profile?")}
                className={styles.chip}
              >
                How to update user profile?
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1;
          const isStreamingCurrent = isStreaming && isLast && msg.role === "assistant";

          return (
            <div
              key={idx}
              className={`${styles.messageRow} ${
                msg.role === "user" ? styles.rowUser : styles.rowAi
              }`}
            >
              {msg.role === "assistant" && (
                <div className={styles.avatarAi}>
                  <Bot size={14} />
                </div>
              )}
              <div
                className={`${styles.bubble} ${
                  msg.role === "user" ? styles.bubbleUser : styles.bubbleAi
                }`}
              >
                <span className={styles.messageContent}>{msg.content}</span>
                {isStreamingCurrent && (
                  <span className={styles.typingIndicator}>
                    <span className={styles.dot}></span>
                    <span className={styles.dot}></span>
                    <span className={styles.dot}></span>
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {error && (
          <div className={styles.errorBanner}>
            <p>{error}</p>
          </div>
        )}

        {escalationTicketId && (
          <div className={styles.escalationBanner}>
            <CheckCircle size={20} className={styles.escalationIcon} />
            <div className={styles.escalationText}>
              Ticket created (<Link to={`/support-tickets/${escalationTicketId}`}><strong>#{escalationTicketId}</strong></Link>).
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className={styles.inputArea}>
        {messages.length > 0 && !escalationTicketId && (
          <button
            type="button"
            onClick={forceEscalate}
            className={styles.talkToPersonBtn}
          >
            Escalate issue
          </button>
        )}
        <div className={styles.inputRow}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isStreaming}
            placeholder="Ask the AI assistant..."
            className={styles.input}
          />
          <Button
            size="icon-md"
            type="submit"
            disabled={isStreaming || !inputValue.trim()}
            aria-label="Send message"
          >
            <Send size={16} />
          </Button>
        </div>
      </form>
    </div>
  );
};