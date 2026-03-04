import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { addAgentToThread, createAgent, createThread, initDb } from "./db";
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
      const mockWs = { send: () => {}, data: {} } as unknown as ServerWebSocket<{
        threadId?: number;
      }>;

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
      const mockWs1 = {
        send: (msg: string) => messages.push(msg),
        data: {},
      } as unknown as ServerWebSocket<unknown>;
      const mockWs2 = {
        send: (msg: string) => messages.push(msg),
        data: {},
      } as unknown as ServerWebSocket<unknown>;

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
      const mockWs1 = {
        send: (msg: string) => messages.push(msg),
        data: {},
      } as unknown as ServerWebSocket<unknown>;
      const mockWs2 = {
        send: (_msg: string) => {},
        data: {},
      } as unknown as ServerWebSocket<unknown>;

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
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);

      // Mock fetch for agent responses
      globalThis.fetch = Object.assign(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "AI response" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      process.env.OPENAI_API_KEY = "test-key";

      await wsManager.handleClientMessage(mockWs, JSON.stringify({ content: "Hello" }));

      // Should broadcast user message
      const userMessage = messages.find((m) => m.includes("Hello"));
      expect(userMessage).toBeDefined();
    });

    test("should return error for invalid JSON", async () => {
      const thread = createThread(db, "Test Thread");
      const sentMessages: string[] = [];
      const mockWs = {
        send: (msg: string) => sentMessages.push(msg),
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);

      await wsManager.handleClientMessage(mockWs, "invalid json");

      expect(sentMessages.some((m) => m.includes("error"))).toBe(true);
    });

    test("should not broadcast typing when thread has no agents", async () => {
      const thread = createThread(db, "Test Thread");
      const messages: string[] = [];
      const mockWs = {
        send: (msg: string) => messages.push(msg),
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);

      await wsManager.handleClientMessage(mockWs, JSON.stringify({ content: "Hello" }));

      // Wait for async triggerAgents to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have the user message broadcast but no typing indicator
      const typingMessages = messages.filter((m) => m.includes('"typing"'));
      expect(typingMessages).toHaveLength(0);
    });

    test("should broadcast per-agent typing indicators and individual messages", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Typing Agent",
        avatar_emoji: "🤖",
        system_prompt: "Test",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      addAgentToThread(db, thread.id, agent.id);

      process.env.OPENAI_API_KEY = "test-key";
      globalThis.fetch = Object.assign(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "AI response" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      const sentMessages: string[] = [];
      const mockWs = {
        send: (msg: string) => sentMessages.push(msg),
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);
      await wsManager.handleClientMessage(mockWs, JSON.stringify({ content: "Hello" }));

      // Wait for async triggerAgents to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const parsed = sentMessages.map((m) => JSON.parse(m));

      // Should have initial typing with agentIds
      const typingStart = parsed.find((m) => m.type === "typing" && m.agentIds?.length > 0);
      expect(typingStart).toBeDefined();
      expect(typingStart.agentIds).toContain(agent.id);

      // Should have agent message broadcast individually
      const agentMessage = parsed.find((m) => m.type === "message" && m.message?.role === "agent");
      expect(agentMessage).toBeDefined();
      expect(agentMessage.message.content).toBe("AI response");

      // Should end with empty typing
      const lastTyping = parsed.filter((m) => m.type === "typing").pop();
      expect(lastTyping.agentIds).toEqual([]);
    });

    test("should only trigger mentioned agents when mentionedAgentIds provided", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Agent One",
        avatar_emoji: "1️⃣",
        system_prompt: "You are agent one",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Agent Two",
        avatar_emoji: "2️⃣",
        system_prompt: "You are agent two",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      addAgentToThread(db, thread.id, agent1.id);
      addAgentToThread(db, thread.id, agent2.id);

      process.env.OPENAI_API_KEY = "test-key";
      const fetchCalls: Array<{ body: unknown }> = [];
      globalThis.fetch = Object.assign(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const body = init?.body ? JSON.parse(init.body as string) : undefined;
          fetchCalls.push({ body });
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Response" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      const sentMessages: string[] = [];
      const mockWs = {
        send: (msg: string) => sentMessages.push(msg),
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);
      await wsManager.handleClientMessage(
        mockWs,
        JSON.stringify({ content: "@Agent One hello", mentionedAgentIds: [agent1.id] }),
      );

      // Wait for async triggerAgents
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Only agent1 should have been called
      expect(fetchCalls.length).toBe(1);
      const body = fetchCalls[0]!.body as { messages: Array<{ content: string }> };
      expect(body.messages[0]!.content).toBe("You are agent one");
    });

    test("should trigger all agents when no mentionedAgentIds provided", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Agent A",
        avatar_emoji: "🅰️",
        system_prompt: "You are agent A",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Agent B",
        avatar_emoji: "🅱️",
        system_prompt: "You are agent B",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      addAgentToThread(db, thread.id, agent1.id);
      addAgentToThread(db, thread.id, agent2.id);

      process.env.OPENAI_API_KEY = "test-key";
      const fetchCalls: Array<{ body: unknown }> = [];
      globalThis.fetch = Object.assign(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const body = init?.body ? JSON.parse(init.body as string) : undefined;
          fetchCalls.push({ body });
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Response" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      const sentMessages: string[] = [];
      const mockWs = {
        send: (msg: string) => sentMessages.push(msg),
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);
      await wsManager.handleClientMessage(
        mockWs,
        JSON.stringify({ content: "Hello everyone" }),
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Both agents should have been called
      expect(fetchCalls.length).toBe(2);
    });

    test("should silently ignore invalid mentionedAgentIds", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Valid Agent",
        avatar_emoji: "✅",
        system_prompt: "You are valid",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      addAgentToThread(db, thread.id, agent.id);

      process.env.OPENAI_API_KEY = "test-key";
      const fetchCalls: Array<{ body: unknown }> = [];
      globalThis.fetch = Object.assign(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const body = init?.body ? JSON.parse(init.body as string) : undefined;
          fetchCalls.push({ body });
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Response" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      const sentMessages: string[] = [];
      const mockWs = {
        send: (msg: string) => sentMessages.push(msg),
        data: { threadId: thread.id },
      } as unknown as ServerWebSocket<{ threadId: number }>;

      wsManager.joinThread(mockWs, thread.id);
      await wsManager.handleClientMessage(
        mockWs,
        JSON.stringify({ content: "@Nobody hello", mentionedAgentIds: [99999] }),
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // No agents should be triggered (99999 doesn't match any thread agent)
      expect(fetchCalls.length).toBe(0);
    });

    test("should return error when not in a thread", async () => {
      const mockWs = {
        send: (_msg: string) => {},
        data: {},
      } as unknown as ServerWebSocket<{ threadId?: number }>;

      const result = await wsManager.handleClientMessage(
        mockWs,
        JSON.stringify({ content: "Hello" }),
      );

      expect(result).toBe(false);
    });
  });
});
