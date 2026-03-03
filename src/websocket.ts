import type { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import { createMessage, getAgentsForThread, getThread } from "./db";
import { triggerAgentResponses } from "./orchestration";

interface WebSocketData {
  threadId?: number;
}

type WS = ServerWebSocket<WebSocketData>;

export class WebSocketManager {
  private db: Database;
  private rooms: Map<number, Set<WS>> = new Map();

  constructor(db: Database) {
    this.db = db;
  }

  joinThread(ws: WS, threadId: number): void {
    // Add to room
    if (!this.rooms.has(threadId)) {
      this.rooms.set(threadId, new Set());
    }
    this.rooms.get(threadId)!.add(ws);

    // Store threadId on websocket data
    ws.data.threadId = threadId;
  }

  leaveThread(ws: WS, threadId: number): void {
    const room = this.rooms.get(threadId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(threadId);
      }
    }

    if (ws.data.threadId === threadId) {
      delete ws.data.threadId;
    }
  }

  broadcastToThread(threadId: number, message: unknown): void {
    const room = this.rooms.get(threadId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    for (const ws of room) {
      try {
        ws.send(messageStr);
      } catch {
        // Client disconnected, remove from room
        room.delete(ws);
      }
    }
  }

  getClientsInThread(threadId: number): WS[] {
    const room = this.rooms.get(threadId);
    return room ? Array.from(room) : [];
  }

  async handleClientMessage(ws: WS, message: string): Promise<boolean> {
    const threadId = ws.data.threadId;
    if (!threadId) {
      ws.send(JSON.stringify({ error: "Not in a thread" }));
      return false;
    }

    try {
      const data = JSON.parse(message) as { content?: string };

      if (!data.content?.trim()) {
        ws.send(JSON.stringify({ error: "Content is required" }));
        return false;
      }

      // Verify thread exists
      const thread = getThread(this.db, threadId);
      if (!thread) {
        ws.send(JSON.stringify({ error: "Thread not found" }));
        return false;
      }

      // Save user message
      const userMessage = createMessage(this.db, threadId, "user", null, data.content.trim());

      // Broadcast to all clients in thread
      this.broadcastToThread(threadId, {
        type: "message",
        message: userMessage,
      });

      // Trigger agent responses in background
      this.triggerAgents(threadId, data.content.trim());

      return true;
    } catch (error) {
      if (error instanceof SyntaxError) {
        ws.send(JSON.stringify({ error: "Invalid JSON" }));
      } else {
        ws.send(JSON.stringify({ error: "Failed to process message" }));
      }
      return false;
    }
  }

  private async triggerAgents(threadId: number, userMessage: string): Promise<void> {
    // Check if there are any agents assigned before broadcasting typing
    const thread = getThread(this.db, threadId);
    if (!thread) return;

    const agents = getAgentsForThread(this.db, threadId);
    if (agents.length === 0) return;

    const responseMode = thread.response_mode ?? "concurrent";
    const isSequential = responseMode !== "concurrent";

    try {
      if (!isSequential) {
        // Concurrent: show all agents typing at once
        const typingAgentIds = new Set<number>(agents.map((a) => a.id));
        this.broadcastToThread(threadId, { type: "typing", agentIds: [...typingAgentIds] });

        await triggerAgentResponses(
          this.db,
          threadId,
          userMessage,
          (message) => {
            this.broadcastToThread(threadId, { type: "message", message });
            if (message.agent_id) {
              typingAgentIds.delete(message.agent_id);
            }
            this.broadcastToThread(threadId, { type: "typing", agentIds: [...typingAgentIds] });
          },
          responseMode,
        );
      } else {
        // Sequential: typing indicator shows only the current agent (handled naturally
        // because onMessage fires after each agent completes, and the next agent starts)
        await triggerAgentResponses(
          this.db,
          threadId,
          userMessage,
          (message) => {
            this.broadcastToThread(threadId, { type: "message", message });
          },
          responseMode,
          (agent) => {
            // Called before each agent starts — show only this agent as typing
            this.broadcastToThread(threadId, { type: "typing", agentIds: [agent.id] });
          },
        );
      }

      // Ensure typing is cleared when all agents finish
      this.broadcastToThread(threadId, { type: "typing", agentIds: [] });
    } catch (error) {
      console.error("Error triggering agents:", error);
      this.broadcastToThread(threadId, { type: "typing", agentIds: [] });
    }
  }

  handleClose(ws: WS): void {
    const threadId = ws.data.threadId;
    if (threadId) {
      this.leaveThread(ws, threadId);
    }
  }
}
