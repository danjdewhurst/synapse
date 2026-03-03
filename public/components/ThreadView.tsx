import { useState, useEffect, useRef } from "react";
import type { Thread, Message, Agent } from "../types";
import * as api from "../api";

interface ThreadViewProps {
  thread: Thread;
  messages: Message[];
  agents: Agent[];
  isTyping: boolean;
  isConnected: boolean;
  onSendMessage: (content: string) => void;
}

export function ThreadView({
  thread,
  messages,
  agents,
  isTyping,
  isConnected,
  onSendMessage,
}: ThreadViewProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, [thread.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const loadMessages = async () => {
    try {
      const data = await api.getMessages(thread.id);
      // We need to pass these up to the parent or store differently
      // For now, just render what we have from props
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const content = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      await onSendMessage(content);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAgentName = (agentId: number | null) => {
    if (!agentId) return "You";
    const agent = agents.find((a) => a.id === agentId);
    return agent ? `${agent.avatar_emoji} ${agent.name}` : "Unknown";
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .split("\n")
      .map((line, i) => <p key={i}>{line || <br />}</p>);
  };

  return (
    <div className="thread-view">
      <div className="thread-header">
        <h2>{thread.title}</h2>
        <span
          className={`connection-status ${
            isConnected ? "connected" : "disconnected"
          }`}
        >
          {isConnected ? "● Connected" : "● Disconnected"}
        </span>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role} ${
                message.status === "error" ? "error" : ""
              }`}
            >
              <div className="message-header">
                {getAgentName(message.agent_id)}
              </div>
              <div className="message-content">
                {formatContent(message.content)}
              </div>
            </div>
          ))
        )}

        {isTyping && (
          <div className="typing-indicator">
            <span>Agents are thinking</span>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="message-input-container">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading || !isConnected}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
