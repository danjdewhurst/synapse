import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, createThread, createAgent, type Message } from "./db";
import { handleAddMessage, handleGetMessages } from "./messages";

const TEST_DB_PATH = ":memory:";

describe("Messages API", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    initDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("POST /api/threads/:id/messages", () => {
    test("should add a user message to a thread", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(
        `http://localhost/api/threads/${thread.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello world" }),
        }
      );

      const response = await handleAddMessage(db, request, thread.id);

      expect(response.status).toBe(201);
      const body = await response.json() as Message;
      expect(body.id).toBeDefined();
      expect(body.thread_id).toBe(thread.id);
      expect(body.role).toBe("user");
      expect(body.agent_id).toBeNull();
      expect(body.content).toBe("Hello world");
      expect(body.status).toBe("complete");
    });

    test("should return 404 for non-existent thread", async () => {
      const request = new Request(
        "http://localhost/api/threads/999/messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello" }),
        }
      );

      const response = await handleAddMessage(db, request, 999);

      expect(response.status).toBe(404);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Thread not found");
    });

    test("should return 400 when content is missing", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(
        `http://localhost/api/threads/${thread.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      const response = await handleAddMessage(db, request, thread.id);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Content is required");
    });

    test("should return 400 when content is empty", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(
        `http://localhost/api/threads/${thread.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "   " }),
        }
      );

      const response = await handleAddMessage(db, request, thread.id);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Content is required");
    });

    test("should return 400 for invalid JSON", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(
        `http://localhost/api/threads/${thread.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "invalid json",
        }
      );

      const response = await handleAddMessage(db, request, thread.id);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid JSON");
    });
  });

  describe("GET /api/threads/:id/messages", () => {
    test("should return messages for a thread", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Add some messages via the handler
      await handleAddMessage(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "User message" }),
        }),
        thread.id
      );

      await handleAddMessage(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Agent message", agent_id: agent.id }),
        }),
        thread.id
      );

      const request = new Request(
        `http://localhost/api/threads/${thread.id}/messages`
      );
      const response = await handleGetMessages(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = await response.json() as [Message, Message];
      expect(body).toHaveLength(2);
      expect(body[0].content).toBe("User message");
      expect(body[1].content).toBe("Agent message");
    });

    test("should return 404 for non-existent thread", async () => {
      const request = new Request("http://localhost/api/threads/999/messages");
      const response = await handleGetMessages(db, request, 999);

      expect(response.status).toBe(404);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Thread not found");
    });

    test("should return empty array for thread with no messages", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(
        `http://localhost/api/threads/${thread.id}/messages`
      );
      const response = await handleGetMessages(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = await response.json() as Message[];
      expect(body).toEqual([]);
    });
  });
});
