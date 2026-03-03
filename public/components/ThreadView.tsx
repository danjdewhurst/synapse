import { Button, Checkbox, Flex, IconButton, Popover, Select, Text } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent, Message, ResponseMode, Thread } from "../types";

interface ThreadViewProps {
  thread: Thread;
  messages: Message[];
  agents: Agent[];
  threadAgentIds: number[];
  typingAgentIds: number[];
  isConnected: boolean;
  hasMoreMessages: boolean;
  onSendMessage: (content: string) => void;
  onThreadAgentsChange: (agentIds: number[]) => void;
  onResponseModeChange: (mode: ResponseMode) => void;
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
  typingAgentIds,
  isConnected,
  hasMoreMessages,
  onSendMessage,
  onThreadAgentsChange,
  onResponseModeChange,
  onLoadEarlierMessages,
}: ThreadViewProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  }, []);

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

  const activeAgents = agents.filter((a) => a.is_active);
  const isOrdered = thread.response_mode === "ordered";

  // Get thread agents in their current order (threadAgentIds preserves position order)
  const orderedThreadAgents = threadAgentIds
    .map((id) => activeAgents.find((a) => a.id === id))
    .filter((a): a is Agent => a !== undefined);

  const moveAgent = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= threadAgentIds.length) return;
    const newIds = [...threadAgentIds];
    [newIds[index], newIds[newIndex]] = [newIds[newIndex]!, newIds[index]!];
    onThreadAgentsChange(newIds);
  };

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
            <Popover.Content style={{ minWidth: 240 }}>
              <Flex direction="column" gap="3">
                <Flex direction="column" gap="1">
                  <Text size="1" weight="bold" color="gray">
                    Response mode
                  </Text>
                  <Select.Root
                    value={thread.response_mode ?? "concurrent"}
                    onValueChange={(value: string) => onResponseModeChange(value as ResponseMode)}
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="concurrent">All at once</Select.Item>
                      <Select.Item value="random">Random sequential</Select.Item>
                      <Select.Item value="ordered">Ordered sequential</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Flex>

                <Flex direction="column" gap="1">
                  <Text size="1" weight="bold" color="gray">
                    Agents
                  </Text>
                  {activeAgents.length === 0 ? (
                    <Text size="1" color="gray">
                      No agents available
                    </Text>
                  ) : (
                    <Flex direction="column" gap="2">
                      {activeAgents.map((agent) => (
                        <Flex key={agent.id} align="center" gap="2" asChild>
                          {/* biome-ignore lint/a11y/noLabelWithoutControl: Radix Checkbox renders input internally */}
                          <label>
                            <Checkbox
                              checked={threadAgentIds.includes(agent.id)}
                              onCheckedChange={() => {
                                const newIds = threadAgentIds.includes(agent.id)
                                  ? threadAgentIds.filter((id) => id !== agent.id)
                                  : [...threadAgentIds, agent.id];
                                onThreadAgentsChange(newIds);
                              }}
                            />
                            <Text size="2">
                              {agent.avatar_emoji} {agent.name}
                            </Text>
                          </label>
                        </Flex>
                      ))}
                    </Flex>
                  )}
                </Flex>

                {isOrdered && orderedThreadAgents.length > 1 && (
                  <Flex direction="column" gap="1">
                    <Text size="1" weight="bold" color="gray">
                      Order
                    </Text>
                    <Flex direction="column" gap="1">
                      {orderedThreadAgents.map((agent, index) => (
                        <Flex key={agent.id} align="center" gap="2" justify="between">
                          <Text size="2">
                            {agent.avatar_emoji} {agent.name}
                          </Text>
                          <Flex gap="1">
                            <IconButton
                              size="1"
                              variant="ghost"
                              disabled={index === 0}
                              onClick={() => moveAgent(index, -1)}
                            >
                              ▲
                            </IconButton>
                            <IconButton
                              size="1"
                              variant="ghost"
                              disabled={index === orderedThreadAgents.length - 1}
                              onClick={() => moveAgent(index, 1)}
                            >
                              ▼
                            </IconButton>
                          </Flex>
                        </Flex>
                      ))}
                    </Flex>
                  </Flex>
                )}
              </Flex>
            </Popover.Content>
          </Popover.Root>
          <span className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
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
              className={`message ${message.role} ${message.status === "error" ? "error" : ""}`}
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
                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
              </div>
            </div>
          ))
        )}

        {typingAgentIds.length > 0 && (
          <div className="typing-indicator">
            <span>
              {typingAgentIds
                .map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return agent ? `${agent.avatar_emoji} ${agent.name}` : "Agent";
                })
                .join(", ")}{" "}
              {typingAgentIds.length === 1 ? "is" : "are"} thinking
            </span>
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
