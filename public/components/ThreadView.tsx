import { useState, useEffect, useRef } from "react";
import { Button, Flex, Text, Popover, Checkbox } from "@radix-ui/themes";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

/** Deterministic hue from agent ID for colour-coding */
function agentHue(agentId: number): number {
  // Golden-angle distribution gives well-spaced hues
  return (agentId * 137.508) % 360;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  }, [input]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter or Ctrl/Cmd+Enter sends; Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getAgentLabel = (message: Message) => {
    if (message.role === "user") return "You";
    if (message.agent_name) return `${message.agent_avatar_emoji ?? "🤖"} ${message.agent_name}`;
    // Fallback to client-side lookup for legacy messages
    const agent = agents.find((a) => a.id === message.agent_id);
    return agent ? `${agent.avatar_emoji} ${agent.name}` : "Unknown";
  };

  const activeAgents = agents.filter(a => a.is_active);

  return (
    <div className="thread-view">
      <div className="thread-header">
        <h2>{thread.title}</h2>
        <Flex align="center" gap="2">
          <Popover.Root>
            <Popover.Trigger>
              <Button variant="outline" size="1">
                Agents ({threadAgentIds.length})
              </Button>
            </Popover.Trigger>
            <Popover.Content style={{ minWidth: 200 }}>
              {activeAgents.length === 0 ? (
                <Text size="1" color="gray">No agents available</Text>
              ) : (
                <Flex direction="column" gap="2">
                  {activeAgents.map(agent => (
                    <Flex key={agent.id} align="center" gap="2" asChild>
                      <label>
                        <Checkbox
                          checked={threadAgentIds.includes(agent.id)}
                          onCheckedChange={() => {
                            const newIds = threadAgentIds.includes(agent.id)
                              ? threadAgentIds.filter(id => id !== agent.id)
                              : [...threadAgentIds, agent.id];
                            onThreadAgentsChange(newIds);
                          }}
                        />
                        <Text size="2">{agent.avatar_emoji} {agent.name}</Text>
                      </label>
                    </Flex>
                  ))}
                </Flex>
              )}
            </Popover.Content>
          </Popover.Root>
          <span
            className={`connection-status ${isConnected ? "connected" : "disconnected"}`}
          >
            {isConnected ? "● Connected" : "● Disconnected"}
          </span>
        </Flex>
      </div>

      <div className="messages-container">
        {hasMoreMessages && (
          <Button
            variant="outline"
            size="1"
            onClick={onLoadEarlierMessages}
            style={{ alignSelf: "center", marginBottom: "0.5rem" }}
          >
            Load earlier messages
          </Button>
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
              style={
                message.agent_id
                  ? ({ "--agent-hue": agentHue(message.agent_id) } as React.CSSProperties)
                  : undefined
              }
            >
              <div className="message-header">
                <span className={message.agent_id ? "agent-label" : ""}>
                  {getAgentLabel(message)}
                </span>
              </div>
              <div className="message-content">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </Markdown>
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

      <div className="message-input-container">
        <textarea
          ref={textareaRef}
          className="message-textarea"
          placeholder="Type a message… (Shift+Enter for new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
          rows={1}
        />
        <Button onClick={handleSend} disabled={!input.trim() || !isConnected}>
          Send
        </Button>
      </div>
    </div>
  );
}
