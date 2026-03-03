import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import type { ServerWebSocket } from "bun";
import { Database } from "bun:sqlite";
import { initDb, createThread, createAgent, addAgentToThread } from "./db";
import { WebSocketManager } from "./websocket";

const TEST_DB_PATH = ":memory:";

describe("WebSocket Manager", () => {
  let db: Database;
  let wsManager: WebSocketManager;

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    initDb(db);
    wsManager = new WebSocketManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("joinThread", () => {
    test("should add client to thread room", () => {
      const thread = createThread(db, "Test Thread");
      const mockWs = { send: () => {}, data: {} } as unknown as ServerWebSocket<unknown>;

      wsManager.joinThread(mockWs, thread.id);

      expect(wsManager.getClientsInThread(thread.id)).toContain(mockWs);
    });

    test("should store threadId on websocket data", () => {
      const thread = createThread(db, "Test Thread");
      const mockWs = { send: () => {}, data: {} } as unknown as ServerWebSocket<{ threadId?: number }>;

      wsManager.joinThread(mockWs, thread.id);

      expect(mockWs.data.threadId).toBe(thread.id);
    });
  });

  describe("leaveThread", () => {
    test("should remove client from thread room", () => {
      const thread = createThread(db, "Test Thread");
      const mockWs = { send: () => {}, data: {} } as unknown as ServerWebSocket<unknown>;

      wsManager.joinThread(mockWs, thread.id);
      wsManager.leaveThread(mockWs, thread.id);

      expect(wsManager.getClientsInThread(thread.id)).not.toContain(mockWs);
    });
  });

  describe("broadcastToThread", () => {
    test("should send message to all clients in thread", () => {
      const thread = createThread(db, "Test Thread");
      const messages: string[] = [];
      const mockWs1 = { send: (msg: string) => messages.push(msg), data: {} } as unknown as ServerWebSocket<unknown>;
      const mockWs2 = { send: (msg: string) => messages.push(msg), data: {} } as unknown as ServerWebSocket<unknown>;

      wsManager.joinThread(mockWs1, thread.id);
      wsManager.joinThread(mockWs2, thread.id);

      wsManager.broadcastToThread(thread.id, { type: "test", data: "hello" });

      expect(messages.length).toBe(2);
      expect(JSON.parse(messages[0])).toEqual({ type: "test", data: "hello" });
    });

    test("should not send to clients in other threads", () => {
      const thread1 = createThread(db, "Thread 1");
      const thread2 = createThread(db, "Thread 2");
      const messages: string[] = [];
      const mockWs1 = { send: (msg: string) => messages.push(msg), data: {} } as unknown as ServerWebSocket<unknown>;
      const mockWs2 = { send: (msg: string) => {}, data: {} } as unknown as ServerWebSocket<unknown>;

      wsManager.joinThread(mockWs1, thread1.id);
      wsManager.joinThread(mockWs2, thread2.id);

      wsManager.broadcastToThread(thread1.id, { type: "test", data: "hello" });

      expect(messages.length).toBe(1);
    });
  });

  describe("handleClientMessage", () => {
    test("should save user message and broadcast to thread", async () => {
      const thread = createThread(db, "Test Thread");
      const messages: string[] = [];
      const mockWs = {
        send: (msg: string) => messages.push(msg),
        data: { threadId: thread.id }
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);

      // Mock fetch for agent responses
      globalThis.fetch = Object.assign(
        async () => new Response(
          JSON.stringify({ choices: [{ message: { content: "AI response" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
        { preconnect: undefined, writable: true }
      ) as typeof globalThis.fetch;

      process.env.OPENAI_API_KEY = "test-key";

      await wsManager.handleClientMessage(mockWs, JSON.stringify({ content: "Hello" }));

      // Should broadcast user message
      const userMessage = messages.find(m => m.includes("Hello"));
      expect(userMessage).toBeDefined();
    });

    test("should return error for invalid JSON", async () => {
      const thread = createThread(db, "Test Thread");
      const sentMessages: string[] = [];
      const mockWs = {
        send: (msg: string) => sentMessages.push(msg),
        data: { threadId: thread.id }
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);

      await wsManager.handleClientMessage(mockWs, "invalid json");

      expect(sentMessages.some(m => m.includes("error"))).toBe(true);
    });

    test("should return error when not in a thread", async () => {
      const mockWs = {
        send: (msg: string) => {},
        data: {}
      } as unknown as ServerWebSocket<{ threadId?: number }>;

      const result = await wsManager.handleClientMessage(mockWs, JSON.stringify({ content: "Hello" }));

      expect(result).toBe(false);
    });
  });
});
