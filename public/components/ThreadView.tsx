import { useState, useEffect, useRef } from "react";
import type { Thread, Message, Agent } from "../types";

interface ThreadViewProps {
  thread: Thread;
  messages: Message[];
  agents: Agent[];
  threadAgentIds: number[];
  isTyping: boolean;
  isConnected: boolean;
  hasMoreMessages: boolean;
  onSendMessage: (content: string) => void;
  onThreadAgentsChange: (agentIds: number[]) => void;
  onLoadEarlierMessages: () => void;
}

export function ThreadView({
  thread,
  messages,
  agents,
  threadAgentIds,
  isTyping,
  isConnected,
  hasMoreMessages,
  onSendMessage,
  onThreadAgentsChange,
  onLoadEarlierMessages,
}: ThreadViewProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

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
        <div className="thread-header-actions">
          <div className="agent-picker-wrapper">
            <button
              className="outline agent-picker-toggle"
              onClick={() => setShowAgentPicker(!showAgentPicker)}
            >
              Agents ({threadAgentIds.length})
            </button>
            {showAgentPicker && (
              <div className="agent-picker-dropdown">
                {agents.filter(a => a.is_active).length === 0 ? (
                  <p className="agent-picker-empty">No agents available</p>
                ) : (
                  agents.filter(a => a.is_active).map(agent => (
                    <label key={agent.id} className="agent-picker-item">
                      <input
                        type="checkbox"
                        checked={threadAgentIds.includes(agent.id)}
                        onChange={() => {
                          const newIds = threadAgentIds.includes(agent.id)
                            ? threadAgentIds.filter(id => id !== agent.id)
                            : [...threadAgentIds, agent.id];
                          onThreadAgentsChange(newIds);
                        }}
                      />
                      <span>{agent.avatar_emoji} {agent.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
          <span
            className={`connection-status ${
              isConnected ? "connected" : "disconnected"
            }`}
          >
            {isConnected ? "● Connected" : "● Disconnected"}
          </span>
        </div>
      </div>

      <div className="messages-container">
        {hasMoreMessages && (
          <button
            className="outline load-earlier-btn"
            onClick={onLoadEarlierMessages}
          >
            Load earlier messages
          </button>
        )}
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
