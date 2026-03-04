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
  onSendMessage: (content: string, mentionedAgentIds?: number[]) => void;
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
  const [mentionedAgentIds, setMentionedAgentIds] = useState<number[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionCursorStart, setMentionCursorStart] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Agents available for mention (active + assigned to thread)
  const mentionableAgents = agents.filter(
    (a) => a.is_active && threadAgentIds.includes(a.id),
  );

  const filteredMentionAgents = mentionableAgents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

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

  // Reset mention index when filter changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFilter]);

  const insertMention = (agent: Agent) => {
    const before = input.slice(0, mentionCursorStart);
    const after = input.slice(textareaRef.current?.selectionStart ?? input.length);
    const mentionText = `@${agent.name} `;
    setInput(before + mentionText + after);
    setShowMentionDropdown(false);
    setMentionFilter("");
    if (!mentionedAgentIds.includes(agent.id)) {
      setMentionedAgentIds((prev) => [...prev, agent.id]);
    }
    // Focus textarea after inserting
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const cursorPos = before.length + mentionText.length;
        ta.focus();
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    });
  };

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim(), mentionedAgentIds.length > 0 ? mentionedAgentIds : undefined);
    setInput("");
    setMentionedAgentIds([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    // Check for @ trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|\s)@(\w*)$/);

    if (atMatch) {
      const filterText = atMatch[2] ?? "";
      setShowMentionDropdown(true);
      setMentionFilter(filterText);
      setMentionCursorStart(cursorPos - filterText.length - 1); // position of @
    } else {
      setShowMentionDropdown(false);
      setMentionFilter("");
    }

    // Sync mentionedAgentIds with actual @mentions in text
    const mentionedNames = new Set(
      [...value.matchAll(/@([\w\s]+?)(?=\s@|\s{2}|$)/g)].map((m) => m[1].trim()),
    );
    setMentionedAgentIds(
      mentionableAgents
        .filter((a) => mentionedNames.has(a.name))
        .map((a) => a.id),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention dropdown navigation
    if (showMentionDropdown && filteredMentionAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMentionAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) =>
          prev <= 0 ? filteredMentionAgents.length - 1 : prev - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredMentionAgents[mentionIndex];
        if (selected) insertMention(selected);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }

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

  /** Preprocess message content to bold @AgentName mentions */
  const highlightMentions = (content: string): string => {
    const agentNames = mentionableAgents.map((a) => a.name);
    if (agentNames.length === 0) return content;
    const escaped = agentNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`@(${escaped.join("|")})`, "g");
    return content.replace(pattern, "**@$1**");
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
                <Markdown remarkPlugins={[remarkGfm]}>{highlightMentions(message.content)}</Markdown>
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
        <div className="message-input-wrapper">
          {showMentionDropdown && filteredMentionAgents.length > 0 && (
            <div className="mention-dropdown">
              {filteredMentionAgents.map((agent, i) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`mention-option ${i === mentionIndex ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(agent);
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <span>{agent.avatar_emoji}</span>
                  <span>{agent.name}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="message-textarea"
            placeholder="Type a message… Use @ to mention agents"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
            rows={1}
          />
        </div>
        <Button onClick={handleSend} disabled={!input.trim() || !isConnected}>
          Send
        </Button>
      </div>
    </div>
  );
}
