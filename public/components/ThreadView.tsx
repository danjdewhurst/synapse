import { useState, useEffect, useRef } from "react";
import { Button, TextField, Flex, Text, Popover, Checkbox } from "@radix-ui/themes";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    return content
      .split("\n")
      .map((line, i) => <p key={i}>{line || <br />}</p>);
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
        <TextField.Root
          style={{ flex: 1 }}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading || !isConnected}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? "Sending..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
