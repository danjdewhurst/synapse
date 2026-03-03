import { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import index from "./public/index.html";
import { initDb } from "./src/db";
import { WebSocketManager } from "./src/websocket";
import {
  handleListThreads,
  handleCreateThread,
  handleGetThread,
} from "./src/threads";
import { handleGetMessages, handleAddMessage } from "./src/messages";
import {
  handleListAgents,
  handleCreateAgent,
  handleGetAgent,
  handleUpdateAgent,
  handleDeleteAgent,
} from "./src/agents";

// Initialise database
const db = new Database("synapse.db");
initDb(db);

// Initialise WebSocket manager
const wsManager = new WebSocketManager(db);

interface WSData {
  threadId?: number;
}

type WS = ServerWebSocket<WSData>;

const server = Bun.serve({
  port: 3000,
  routes: {
    // Serve frontend
    "/": index,

    // Thread API
    "/api/threads": {
      GET: () => handleListThreads(db, new Request("http://localhost/api/threads")),
      POST: (req) => handleCreateThread(db, req),
    },
    "/api/threads/:id": {
      GET: (req) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetThread(db, req, id);
      },
    },
    "/api/threads/:id/messages": {
      GET: (req) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetMessages(db, req, id);
      },
      POST: (req) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleAddMessage(db, req, id);
      },
    },

    // Agent API
    "/api/agents": {
      GET: () => handleListAgents(db, new Request("http://localhost/api/agents")),
      POST: (req) => handleCreateAgent(db, req),
    },
    "/api/agents/:id": {
      GET: (req) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetAgent(db, req, id);
      },
      PUT: (req) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleUpdateAgent(db, req, id);
      },
      DELETE: (req) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleDeleteAgent(db, req, id);
      },
    },
  },
  websocket: {
    open: (ws: WS) => {
      console.log("WebSocket client connected");
    },
    message: async (ws: WS, message: string) => {
      try {
        const data = JSON.parse(message) as { type?: string; threadId?: number; content?: string };

        if (data.type === "join" && data.threadId) {
          wsManager.joinThread(ws, data.threadId);
          ws.send(JSON.stringify({ type: "joined", threadId: data.threadId }));
        } else if (data.content) {
          await wsManager.handleClientMessage(ws, message);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ error: "Failed to process message" }));
      }
    },
    close: (ws: WS) => {
      wsManager.handleClose(ws);
      console.log("WebSocket client disconnected");
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🧠 Synapse running at http://localhost:${server.port}`);
