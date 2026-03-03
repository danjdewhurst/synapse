import { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import index from "./public/index.html";
import {
  handleCreateAgent,
  handleDeleteAgent,
  handleGetAgent,
  handleListAgents,
  handleUpdateAgent,
} from "./src/agents";
import { initDb } from "./src/db";
import { handleAddMessage, handleGetMessages } from "./src/messages";
import { handleCreateFromPreset, handleListPresets, seedPresets } from "./src/presets";
import {
  handleCreateThread,
  handleGetThread,
  handleGetThreadAgents,
  handleListThreads,
  handleSetThreadAgents,
  handleUpdateThread,
} from "./src/threads";
import { WebSocketManager } from "./src/websocket";

// Initialise database
const db = new Database("synapse.db");
initDb(db);
seedPresets(db);

// Initialise WebSocket manager
const wsManager = new WebSocketManager(db);

interface WSData {
  threadId?: number;
}

type WS = ServerWebSocket<WSData>;

const server = Bun.serve({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: {} as WSData })) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return new Response("Not found", { status: 404 });
  },
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
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetThread(db, req, id);
      },
      PUT: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleUpdateThread(db, req, id);
      },
    },
    "/api/threads/:id/agents": {
      GET: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetThreadAgents(db, req, id);
      },
      PUT: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleSetThreadAgents(db, req, id);
      },
    },
    "/api/threads/:id/messages": {
      GET: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetMessages(db, req, id);
      },
      POST: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleAddMessage(db, req, id);
      },
    },

    // Preset API
    "/api/presets": {
      GET: () => handleListPresets(db, new Request("http://localhost/api/presets")),
    },
    "/api/presets/:index": {
      POST: (req) => {
        const index = parseInt(req.params.index, 10);
        if (Number.isNaN(index)) return Response.json({ error: "Invalid index" }, { status: 400 });
        return handleCreateFromPreset(db, req, index);
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
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleGetAgent(db, req, id);
      },
      PUT: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleUpdateAgent(db, req, id);
      },
      DELETE: (req) => {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return Response.json({ error: "Invalid ID" }, { status: 400 });
        return handleDeleteAgent(db, req, id);
      },
    },
  },
  websocket: {
    open: (_ws: WS) => {
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
