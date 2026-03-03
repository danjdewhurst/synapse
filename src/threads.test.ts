import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Agent, createAgent, createThread, deleteAgent, initDb, type Thread } from "./db";
import {
  handleCreateThread,
  handleGetThread,
  handleGetThreadAgents,
  handleListThreads,
  handleSetThreadAgents,
} from "./threads";

const TEST_DB_PATH = ":memory:";

describe("Thread API", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    initDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /api/threads", () => {
    test("should return empty array when no threads exist", async () => {
      const request = new Request("http://localhost/api/threads");
      const response = await handleListThreads(db, request);

      expect(response.status).toBe(200);
      const body = (await response.json()) as unknown[];
      expect(body).toEqual([]);
    });

    test("should return list of threads ordered by updated_at", async () => {
      const thread1 = createThread(db, "Thread 1");
      const thread2 = createThread(db, "Thread 2");

      const request = new Request("http://localhost/api/threads");
      const response = await handleListThreads(db, request);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Thread[];
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe(thread2.id);
      expect(body[1].id).toBe(thread1.id);
    });
  });

  describe("POST /api/threads", () => {
    test("should create a new thread with title", async () => {
      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Thread" }),
      });

      const response = await handleCreateThread(db, request);

      expect(response.status).toBe(201);
      const body = (await response.json()) as Thread;
      expect(body.id).toBeDefined();
      expect(body.title).toBe("New Thread");
      expect(body.created_at).toBeDefined();
      expect(body.updated_at).toBeDefined();
    });

    test("should return 400 when title is missing", async () => {
      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await handleCreateThread(db, request);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Title is required");
    });

    test("should return 400 when title is empty string", async () => {
      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "   " }),
      });

      const response = await handleCreateThread(db, request);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Title is required");
    });

    test("should return 400 for invalid JSON", async () => {
      const request = new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      const response = await handleCreateThread(db, request);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid JSON");
    });
  });

  describe("GET /api/threads/:id", () => {
    test("should return thread by id", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(`http://localhost/api/threads/${thread.id}`);
      const response = await handleGetThread(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Thread;
      expect(body.id).toBe(thread.id);
      expect(body.title).toBe("Test Thread");
    });

    test("should return 404 for non-existent thread", async () => {
      const request = new Request("http://localhost/api/threads/999");
      const response = await handleGetThread(db, request, 999);

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Thread not found");
    });
  });

  describe("GET /api/threads/:id/agents", () => {
    test("should return agents for a thread", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Set agents via PUT first
      await handleSetThreadAgents(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/agents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_ids: [agent.id] }),
        }),
        thread.id,
      );

      const request = new Request(`http://localhost/api/threads/${thread.id}/agents`);
      const response = await handleGetThreadAgents(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Agent[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(agent.id);
    });

    test("should return empty array for thread with no agents", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(`http://localhost/api/threads/${thread.id}/agents`);
      const response = await handleGetThreadAgents(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Agent[];
      expect(body).toEqual([]);
    });

    test("should return 404 for non-existent thread", async () => {
      const request = new Request("http://localhost/api/threads/999/agents");
      const response = await handleGetThreadAgents(db, request, 999);

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/threads/:id/agents", () => {
    test("should set agents for a thread", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Agent 2",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });

      const request = new Request(`http://localhost/api/threads/${thread.id}/agents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_ids: [agent1.id, agent2.id] }),
      });

      const response = await handleSetThreadAgents(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Agent[];
      expect(body).toHaveLength(2);
    });

    test("should replace existing agents", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Agent 2",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Set first agent
      await handleSetThreadAgents(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/agents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_ids: [agent1.id] }),
        }),
        thread.id,
      );

      // Replace with second agent
      const response = await handleSetThreadAgents(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/agents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_ids: [agent2.id] }),
        }),
        thread.id,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Agent[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(agent2.id);
    });

    test("should clear agents when given empty array", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Set agent
      await handleSetThreadAgents(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/agents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_ids: [agent.id] }),
        }),
        thread.id,
      );

      // Clear
      const response = await handleSetThreadAgents(
        db,
        new Request(`http://localhost/api/threads/${thread.id}/agents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_ids: [] }),
        }),
        thread.id,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Agent[];
      expect(body).toEqual([]);
    });

    test("should return 404 for non-existent thread", async () => {
      const request = new Request("http://localhost/api/threads/999/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_ids: [] }),
      });

      const response = await handleSetThreadAgents(db, request, 999);
      expect(response.status).toBe(404);
    });

    test("should return 400 when agent_ids is not an array", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(`http://localhost/api/threads/${thread.id}/agents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_ids: "not-an-array" }),
      });

      const response = await handleSetThreadAgents(db, request, thread.id);
      expect(response.status).toBe(400);
    });

    test("should return 400 when agent does not exist", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(`http://localhost/api/threads/${thread.id}/agents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_ids: [999] }),
      });

      const response = await handleSetThreadAgents(db, request, thread.id);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("not found or inactive");
    });

    test("should return 400 when agent is inactive", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Inactive Agent",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      deleteAgent(db, agent.id);

      const request = new Request(`http://localhost/api/threads/${thread.id}/agents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_ids: [agent.id] }),
      });

      const response = await handleSetThreadAgents(db, request, thread.id);
      expect(response.status).toBe(400);
    });
  });
});
