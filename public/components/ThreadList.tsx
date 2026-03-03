import { useState, useEffect } from "react";
import { TextField, Button, Flex } from "@radix-ui/themes";
import type { Thread } from "../types";
import * as api from "../api";

interface ThreadListProps {
  threads: Thread[];
  activeThreadId: number | null;
  onThreadSelect: (threadId: number) => void;
  onThreadsUpdate: (threads: Thread[]) => void;
}

export function ThreadList({
  threads,
  activeThreadId,
  onThreadSelect,
  onThreadsUpdate,
}: ThreadListProps) {
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = async () => {
    try {
      const data = await api.listThreads();
      onThreadsUpdate(data);
    } catch (error) {
      console.error("Failed to load threads:", error);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim()) return;

    setIsCreating(true);
    try {
      const thread = await api.createThread(newThreadTitle.trim());
      onThreadsUpdate([thread, ...threads]);
      onThreadSelect(thread.id);
      setNewThreadTitle("");
    } catch (error) {
      console.error("Failed to create thread:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="thread-list-container">
      <form onSubmit={handleCreateThread} className="thread-form">
        <Flex gap="2" p="2">
          <TextField.Root
            style={{ flex: 1 }}
            placeholder="New thread title..."
            value={newThreadTitle}
            onChange={(e) => setNewThreadTitle(e.target.value)}
            disabled={isCreating}
          />
          <Button type="submit" disabled={isCreating || !newThreadTitle.trim()}>
            {isCreating ? "Creating..." : "+ New"}
          </Button>
        </Flex>
      </form>

      <div className="thread-list">
        {threads.length === 0 ? (
          <div className="thread-list-empty">
            <p>No threads yet. Create one to get started!</p>
          </div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              className={`thread-item ${thread.id === activeThreadId ? "active" : ""}`}
              onClick={() => onThreadSelect(thread.id)}
            >
              <div className="thread-item-title">{thread.title}</div>
              <div className="thread-item-date">
                {new Date(thread.updated_at).toLocaleDateString()}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
