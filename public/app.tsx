import React, { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Theme, Button } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import type { Thread, Message, Agent } from "./types";
import { ThreadList } from "./components/ThreadList";
import { ThreadView } from "./components/ThreadView";
import { AgentManager } from "./components/AgentManager";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useWebSocket } from "./useWebSocket";
import * as api from "./api";
import "./styles.css";

const PAGE_SIZE = 100;

function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [threadAgentIds, setThreadAgentIds] = useState<number[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Load messages and thread agents when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setThreadAgentIds([]);
      return;
    }
    let cancelled = false;

    api.getMessages(activeThreadId, { limit: PAGE_SIZE }).then(data => {
      if (!cancelled) {
        setMessages(data);
        setHasMoreMessages(data.length === PAGE_SIZE);
      }
    }).catch(err => console.error("Failed to load messages:", err));

    api.getThreadAgents(activeThreadId).then(agents => {
      if (!cancelled) setThreadAgentIds(agents.map(a => a.id));
    }).catch(err => console.error("Failed to load thread agents:", err));

    return () => { cancelled = true; };
  }, [activeThreadId]);

  const handleNewMessage = useCallback((message: Message) => {
    setMessages((prev) => {
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
    setSidebarOpen(false);
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
      const earlier = await api.getMessages(activeThreadId, {
        limit: PAGE_SIZE,
        offset: messages.length,
      });
      setMessages((prev) => [...earlier, ...prev]);
      setHasMoreMessages(earlier.length === PAGE_SIZE);
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
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h1>🧠 Synapse</h1>
          <Button
            variant="outline"
            onClick={() => setShowAgentManager(!showAgentManager)}
          >
            {showAgentManager ? "← Back" : "🤖 Agents"}
          </Button>
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
            <div className="empty-state-graphic">
              <div className="empty-state-node" />
              <div className="empty-state-node" />
              <div className="empty-state-node" />
              <div className="empty-state-node" />
            </div>
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
    <Theme appearance="dark" accentColor="indigo">
      <App />
    </Theme>
  </ErrorBoundary>
);
