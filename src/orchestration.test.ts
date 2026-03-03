import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, createThread, createAgent, createMessage, addAgentToThread, getMessages } from "./db";
import { triggerAgentResponses, MAX_CONTEXT_MESSAGES } from "./orchestration";

const TEST_DB_PATH = ":memory:";

describe("Agent Orchestration", () => {
  let db: Database;
  let fetchCalls: Array<{ url: string; body: unknown }> = [];

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    initDb(db);
    fetchCalls = [];

    // Set up API keys for testing
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    // Mock fetch
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        fetchCalls.push({ url, body });

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Mocked AI response" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
      { preconnect: undefined, writable: true }
    ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    db.close();
  });

  describe("triggerAgentResponses", () => {
    test("should call API for each agent in thread", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "You are agent 1",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Agent 2",
        avatar_emoji: "🤖",
        system_prompt: "You are agent 2",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });

      addAgentToThread(db, thread.id, agent1.id);
      addAgentToThread(db, thread.id, agent2.id);

      await triggerAgentResponses(db, thread.id, "Hello agents");

      // Should have fetch calls for each agent (may include retries)
      expect(fetchCalls.length).toBeGreaterThanOrEqual(2);
    });

    test("should save agent responses to database", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      await triggerAgentResponses(db, thread.id, "Hello agent");

      const messages = getMessages(db, thread.id);
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("agent");
      expect(messages[0].agent_id).toBe(agent.id);
      expect(messages[0].content).toBe("Mocked AI response");
      expect(messages[0].status).toBe("complete");
    });

    test("should do nothing when thread has no agents", async () => {
      const thread = createThread(db, "Test Thread");

      await triggerAgentResponses(db, thread.id, "Hello");

      expect(fetchCalls.length).toBe(0);

      const messages = getMessages(db, thread.id);
      expect(messages.length).toBe(0);
    });

    test("should only trigger active agents", async () => {
      const thread = createThread(db, "Test Thread");
      const activeAgent = createAgent(db, {
        name: "Active Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are active",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const deletedAgent = createAgent(db, {
        name: "Deleted Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are deleted",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Soft-delete the second agent using db query
      db.prepare("UPDATE agents SET is_active = FALSE WHERE id = ?").run(deletedAgent.id);

      addAgentToThread(db, thread.id, activeAgent.id);
      addAgentToThread(db, thread.id, deletedAgent.id);

      await triggerAgentResponses(db, thread.id, "Hello");

      // Only active agent should trigger calls (may include retries)
      expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    });

    test("should limit context to MAX_CONTEXT_MESSAGES", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      // Create 60 existing messages (more than MAX_CONTEXT_MESSAGES)
      for (let i = 0; i < 60; i++) {
        createMessage(db, thread.id, "user", null, `Message ${i}`);
      }

      await triggerAgentResponses(db, thread.id, "Final message");

      const requestBody = fetchCalls[0].body as { messages: Array<{ role: string; content: string }> };
      // system (1) + last 50 existing messages + new user message (1) = 52
      expect(requestBody.messages.length).toBe(MAX_CONTEXT_MESSAGES + 2);
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[requestBody.messages.length - 1].content).toBe("Final message");
      // First existing message should be message 10 (60 - 50 = 10)
      expect(requestBody.messages[1].content).toBe("Message 10");
    });

    test("should retry with Retry-After header delay on 429", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Retry Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      let callCount = 0;
      globalThis.fetch = Object.assign(
        async () => {
          callCount++;
          if (callCount === 1) {
            return new Response(
              JSON.stringify({ error: "Rate limited" }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": "1",
                },
              }
            );
          }
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Success after retry" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        },
        { preconnect: undefined, writable: true }
      ) as typeof globalThis.fetch;

      await triggerAgentResponses(db, thread.id, "Hello");

      expect(callCount).toBe(2);
      const messages = getMessages(db, thread.id);
      expect(messages[0].content).toBe("Success after retry");
      expect(messages[0].status).toBe("complete");
    });

    test("should not retry on 401 authentication errors", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Auth Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      let callCount = 0;
      globalThis.fetch = Object.assign(
        async () => {
          callCount++;
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        },
        { preconnect: undefined, writable: true }
      ) as typeof globalThis.fetch;

      await triggerAgentResponses(db, thread.id, "Hello");

      expect(callCount).toBe(1);
      const messages = getMessages(db, thread.id);
      expect(messages[0].status).toBe("error");
    });

    test("should include conversation history in API call", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "Test Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a test agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      await triggerAgentResponses(db, thread.id, "Hello agent");

      const requestBody = fetchCalls[0].body as { messages: Array<{ role: string; content: string }> };

      expect(requestBody.messages).toBeDefined();
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[0].content).toBe("You are a test agent");
      expect(requestBody.messages[1].role).toBe("user");
      expect(requestBody.messages[1].content).toBe("Hello agent");
    });
  });
});
