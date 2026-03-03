import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { Thread, Message, Agent } from "./types";
import { ThreadList } from "./components/ThreadList";
import { ThreadView } from "./components/ThreadView";
import { AgentManager } from "./components/AgentManager";
import { useWebSocket } from "./useWebSocket";
import "./styles.css";

function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

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
            isTyping={isTyping}
            isConnected={isConnected}
            onSendMessage={handleSendMessage}
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
root.render(<App />);
