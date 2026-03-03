import React, { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Thread, Message, Agent } from "./types";
import { ThreadList } from "./components/ThreadList";
import { ThreadView } from "./components/ThreadView";
import { AgentManager } from "./components/AgentManager";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useWebSocket } from "./useWebSocket";
import * as api from "./api";
import "./styles.css";

function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [threadAgentIds, setThreadAgentIds] = useState<number[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Load messages and thread agents when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setThreadAgentIds([]);
      return;
    }
    let cancelled = false;

    api.getMessages(activeThreadId, { limit: 100 }).then(data => {
      if (!cancelled) {
        setMessages(data);
        setHasMoreMessages(data.length === 100);
      }
    }).catch(err => console.error("Failed to load messages:", err));

    api.getThreadAgents(activeThreadId).then(agents => {
      if (!cancelled) setThreadAgentIds(agents.map(a => a.id));
    }).catch(err => console.error("Failed to load thread agents:", err));

    return () => { cancelled = true; };
  }, [activeThreadId]);

  const handleNewMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Avoid duplicates
      if (prev.find((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const handleTyping = useCallback((typing: boolean) => {
    setIsTyping(typing);
  }, []);

  const { isConnected, sendMessage } = useWebSocket({
    threadId: activeThreadId,
    onMessage: handleNewMessage,
    onTyping: handleTyping,
  });

  const handleSendMessage = (content: string) => {
    sendMessage(content);
  };

  const handleThreadSelect = (threadId: number) => {
    setActiveThreadId(threadId);
    setMessages([]);
  };

  const handleThreadsUpdate = (updatedThreads: Thread[]) => {
    setThreads(updatedThreads);
  };

  const handleAgentsUpdate = (updatedAgents: Agent[]) => {
    setAgents(updatedAgents);
  };

  const handleLoadEarlierMessages = async () => {
    if (!activeThreadId) return;
    try {
      const allMessages = await api.getMessages(activeThreadId);
      setMessages(allMessages);
      setHasMoreMessages(false);
    } catch (error) {
      console.error("Failed to load earlier messages:", error);
    }
  };

  const handleThreadAgentsChange = async (agentIds: number[]) => {
    if (!activeThreadId) return;
    try {
      const agents = await api.setThreadAgents(activeThreadId, agentIds);
      setThreadAgentIds(agents.map(a => a.id));
    } catch (error) {
      console.error("Failed to update thread agents:", error);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>🧠 Synapse</h1>
          <button
            className="outline"
            onClick={() => setShowAgentManager(!showAgentManager)}
          >
            {showAgentManager ? "← Back" : "🤖 Agents"}
          </button>
        </div>

        {showAgentManager ? (
          <AgentManager
            agents={agents}
            onAgentsUpdate={handleAgentsUpdate}
          />
        ) : (
          <ThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onThreadSelect={handleThreadSelect}
            onThreadsUpdate={handleThreadsUpdate}
          />
        )}
      </aside>

      <main className="main">
        {activeThread ? (
          <ThreadView
            thread={activeThread}
            messages={messages}
            agents={agents}
            threadAgentIds={threadAgentIds}
            isTyping={isTyping}
            isConnected={isConnected}
            hasMoreMessages={hasMoreMessages}
            onSendMessage={handleSendMessage}
            onThreadAgentsChange={handleThreadAgentsChange}
            onLoadEarlierMessages={handleLoadEarlierMessages}
          />
        ) : (
          <div className="empty-state">
            <p>Select a thread or create a new one to start chatting</p>
          </div>
        )}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
