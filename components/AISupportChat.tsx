import React, { useRef, useEffect, useState } from "react";
import { Headset, X, Send, CheckCircle, Bot, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useAISupportChat } from "../helpers/useAISupportChat";
import { Badge } from "./Badge";
import { Button } from "./Button";
import styles from "./AISupportChat.module.css";

export const AISupportChat: React.FC = () => {
  const {
    messages,
    isStreaming,
    escalationTicketId,
    isOpen,
    toggleOpen,
    sendMessage,
    forceEscalate,
    error,
  } = useAISupportChat();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages or state changes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming, escalationTicketId, isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  return (
    <>
      {/* Collapsed FAB */}
      <button
        className={`${styles.fab} ${isOpen ? styles.fabHidden : ""}`}
        onClick={toggleOpen}
        title="Need Help? Chat with us"
        aria-label="Open support chat"
      >
        <Headset size={28} />
      </button>

      {/* Expanded Panel */}
      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Headset size={20} />
            <h3 className={styles.titleText}>Support Chat</h3>
            <Badge variant="primary" className={styles.badge}>
              AI Powered
            </Badge>
          </div>
          <button
            onClick={toggleOpen}
            className={styles.closeBtn}
            aria-label="Close chat"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.messagesArea}>
          {messages.length === 0 && (
            <div className={styles.welcomeState}>
              <div className={styles.welcomeIcon}>
                <Bot size={32} />
              </div>
              <h4>How can we help today?</h4>
              <p>Ask a question or choose an option below to get started.</p>
              
              <div className={styles.suggestions}>
                <button
                  onClick={() => sendMessage("How do I upload my credit report?")}
                  className={styles.chip}
                >
                  How do I upload my credit report?
                </button>
                <button
                  onClick={() => sendMessage("What violations did you find?")}
                  className={styles.chip}
                >
                  What violations did you find?
                </button>
                <button
                  onClick={() => sendMessage("How do I send a dispute letter?")}
                  className={styles.chip}
                >
                  How do I send a dispute letter?
                </button>
                <button onClick={forceEscalate} className={styles.chipEscalate}>
                  I need to talk to a real person
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const isStreamingCurrent =
              isStreaming && isLast && msg.role === "assistant";

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
                We've created a support ticket (<strong>#{escalationTicketId}</strong>) and
                notified our team lead Donna. She'll follow up by email. You can also
                track it in <Link to="/my-info?tab=support">My Info → Support</Link>.
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
              Talk to a person
            </button>
          )}
          <div className={styles.inputRow}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isStreaming}
              placeholder="Type your message..."
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
    </>
  );
};