import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, createThread, getThread, listThreads, createMessage, getMessages, createAgent, getAgent, listAgents, updateAgent, deleteAgent, addAgentToThread, getAgentsForThread } from "./db";

const TEST_DB_PATH = ":memory:";

describe("Database Schema", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    initDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("threads", () => {
    test("should create a thread with title", () => {
      const thread = createThread(db, "Test Thread");
      expect(thread.id).toBeDefined();
      expect(thread.title).toBe("Test Thread");
      expect(thread.created_at).toBeDefined();
      expect(thread.updated_at).toBeDefined();
    });

    test("should retrieve a thread by id", () => {
      const created = createThread(db, "Test Thread");
      const retrieved = getThread(db, created.id);
      expect(retrieved).toEqual(created);
    });

    test("should return null for non-existent thread", () => {
      const result = getThread(db, 999);
      expect(result).toBeNull();
    });

    test("should list all threads ordered by updated_at desc", () => {
      const thread1 = createThread(db, "Thread 1");
      const thread2 = createThread(db, "Thread 2");
      const thread3 = createThread(db, "Thread 3");

      const list = listThreads(db);
      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(thread3.id);
      expect(list[1].id).toBe(thread2.id);
      expect(list[2].id).toBe(thread1.id);
    });

    test("should update updated_at on thread access", () => {
      const thread = createThread(db, "Test Thread");
      const originalUpdatedAt = thread.updated_at;

      // Simulate some time passing and update
      const updated = createMessage(db, thread.id, "user", null, "Hello");

      const retrieved = getThread(db, thread.id);
      expect(new Date(retrieved!.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });

  describe("messages", () => {
    test("should create a user message", () => {
      const thread = createThread(db, "Test Thread");
      const message = createMessage(db, thread.id, "user", null, "Hello world");

      expect(message.id).toBeDefined();
      expect(message.thread_id).toBe(thread.id);
      expect(message.role).toBe("user");
      expect(message.agent_id).toBeNull();
      expect(message.content).toBe("Hello world");
      expect(message.status).toBe("complete");
      expect(message.created_at).toBeDefined();
    });

    test("should create an agent message", () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
        temperature: 0.7,
      });

      const message = createMessage(db, thread.id, "agent", agent.id, "Agent response");

      expect(message.role).toBe("agent");
      expect(message.agent_id).toBe(agent.id);
      expect(message.content).toBe("Agent response");
    });

    test("should get messages for a thread ordered by created_at asc", () => {
      const thread = createThread(db, "Test Thread");
      const msg1 = createMessage(db, thread.id, "user", null, "Message 1");
      const msg2 = createMessage(db, thread.id, "user", null, "Message 2");
      const msg3 = createMessage(db, thread.id, "user", null, "Message 3");

      const messages = getMessages(db, thread.id);
      expect(messages).toHaveLength(3);
      expect(messages[0].id).toBe(msg1.id);
      expect(messages[1].id).toBe(msg2.id);
      expect(messages[2].id).toBe(msg3.id);
    });

    test("should return empty array for thread with no messages", () => {
      const thread = createThread(db, "Test Thread");
      const messages = getMessages(db, thread.id);
      expect(messages).toEqual([]);
    });
  });

  describe("agents", () => {
    test("should create an agent with all fields", () => {
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a helpful assistant",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
        temperature: 0.7,
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe("Test Agent");
      expect(agent.avatar_emoji).toBe("🤖");
      expect(agent.system_prompt).toBe("You are a helpful assistant");
      expect(agent.provider).toBe("openai");
      expect(agent.model).toBe("gpt-4o");
      expect(agent.api_key_ref).toBe("OPENAI_API_KEY");
      expect(agent.temperature).toBe(0.7);
      expect(agent.is_active).toBe(true);
      expect(agent.created_at).toBeDefined();
    });

    test("should create an agent with default temperature", () => {
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a helpful assistant",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });

      expect(agent.temperature).toBe(0.7);
    });

    test("should retrieve an agent by id", () => {
      const created = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a helpful assistant",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      const retrieved = getAgent(db, created.id);
      expect(retrieved).toEqual(created);
    });

    test("should return null for non-existent agent", () => {
      const result = getAgent(db, 999);
      expect(result).toBeNull();
    });

    test("should list all agents ordered by created_at desc", () => {
      const agent1 = createAgent(db, {
        name: "Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "Prompt 1",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      const agent2 = createAgent(db, {
        name: "Agent 2",
        avatar_emoji: "🤖",
        system_prompt: "Prompt 2",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });

      const list = listAgents(db);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(agent2.id);
      expect(list[1].id).toBe(agent1.id);
    });

    test("should update an agent", () => {
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "Original prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      const updated = updateAgent(db, agent.id, {
        name: "Updated Agent",
        system_prompt: "Updated prompt",
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Updated Agent");
      expect(updated!.system_prompt).toBe("Updated prompt");
      expect(updated!.provider).toBe("openai"); // unchanged
    });

    test("should return null when updating non-existent agent", () => {
      const result = updateAgent(db, 999, { name: "Updated" });
      expect(result).toBeNull();
    });

    test("should soft-delete an agent (set is_active false)", () => {
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      const deleted = deleteAgent(db, agent.id);
      expect(deleted).toBe(true);

      const retrieved = getAgent(db, agent.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.is_active).toBe(false);
    });

    test("should return false when deleting non-existent agent", () => {
      const result = deleteAgent(db, 999);
      expect(result).toBe(false);
    });
  });

  describe("thread_agents", () => {
    test("should add agent to thread", () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "Prompt",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      const agents = getAgentsForThread(db, thread.id);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe(agent.id);
    });

    test("should get multiple agents for a thread", () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "Prompt 1",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Agent 2",
        avatar_emoji: "🤖",
        system_prompt: "Prompt 2",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });

      addAgentToThread(db, thread.id, agent1.id);
      addAgentToThread(db, thread.id, agent2.id);

      const agents = getAgentsForThread(db, thread.id);
      expect(agents).toHaveLength(2);
    });

    test("should return empty array for thread with no agents", () => {
      const thread = createThread(db, "Test Thread");
      const agents = getAgentsForThread(db, thread.id);
      expect(agents).toEqual([]);
    });
  });
});
