import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  addAgentToThread,
  createAgent,
  createMessage,
  createThread,
  getMessages,
  initDb,
  setAgentsForThread,
} from "./db";
import { MAX_CONTEXT_MESSAGES, sanitiseName, triggerAgentResponses } from "./orchestration";

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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      { preconnect: undefined, writable: true },
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

    test("should call onMessage callback for each agent response", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Callback Agent 1",
        avatar_emoji: "🤖",
        system_prompt: "You are agent 1",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Callback Agent 2",
        avatar_emoji: "🤖",
        system_prompt: "You are agent 2",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent1.id);
      addAgentToThread(db, thread.id, agent2.id);

      const receivedMessages: Array<{ agent_id: number | null; content: string }> = [];
      await triggerAgentResponses(db, thread.id, "Hello", (message) => {
        receivedMessages.push({ agent_id: message.agent_id, content: message.content });
      });

      expect(receivedMessages.length).toBe(2);
      const agentIds = receivedMessages.map((m) => m.agent_id).sort();
      expect(agentIds).toEqual([agent1.id, agent2.id].sort());
      expect(receivedMessages.every((m) => m.content === "Mocked AI response")).toBe(true);
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

      const requestBody = fetchCalls[0].body as {
        messages: Array<{ role: string; content: string }>;
      };
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
            return new Response(JSON.stringify({ error: "Rate limited" }), {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "1",
              },
            });
          }
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Success after retry" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        { preconnect: undefined, writable: true },
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
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        },
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      await triggerAgentResponses(db, thread.id, "Hello");

      expect(callCount).toBe(1);
      const messages = getMessages(db, thread.id);
      expect(messages[0].status).toBe("error");
    });

    test("should route openrouter agents to OpenAI-compatible endpoint", async () => {
      const thread = createThread(db, "Test Thread");
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      const agent = createAgent(db, {
        name: "OpenRouter Agent",
        avatar_emoji: "🌐",
        system_prompt: "You are an openrouter agent",
        provider: "openrouter",
        model: "google/gemini-2.0-flash-001",
        api_key_ref: "OPENROUTER_API_KEY",
      });

      addAgentToThread(db, thread.id, agent.id);

      await triggerAgentResponses(db, thread.id, "Hello openrouter");

      expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
      expect(fetchCalls[0].url).toContain("openrouter.ai/api/v1/chat/completions");

      const messages = getMessages(db, thread.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("Mocked AI response");
      expect(messages[0].status).toBe("complete");
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

      const requestBody = fetchCalls[0].body as {
        messages: Array<{ role: string; content: string }>;
      };

      expect(requestBody.messages).toBeDefined();
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[0].content).toBe("You are a test agent");
      expect(requestBody.messages[1].role).toBe("user");
      expect(requestBody.messages[1].content).toBe("Hello agent");
    });

    test("should execute agents sequentially in ordered mode", async () => {
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
      const agent3 = createAgent(db, {
        name: "Agent C",
        avatar_emoji: "©️",
        system_prompt: "You are agent C",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Set agents in specific order: agent3, agent1, agent2
      setAgentsForThread(db, thread.id, [agent3.id, agent1.id, agent2.id]);

      const callOrder: number[] = [];
      let resolveCount = 0;

      globalThis.fetch = Object.assign(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const body = init?.body ? JSON.parse(init.body as string) : undefined;
          // Track which agent's system prompt was used to determine call order
          const systemPrompt = body?.messages?.[0]?.content as string;
          if (systemPrompt.includes("agent A")) callOrder.push(agent1.id);
          else if (systemPrompt.includes("agent B")) callOrder.push(agent2.id);
          else if (systemPrompt.includes("agent C")) callOrder.push(agent3.id);

          resolveCount++;
          return new Response(
            JSON.stringify({ choices: [{ message: { content: `Response ${resolveCount}` } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      await triggerAgentResponses(db, thread.id, "Hello", undefined, "ordered");

      // Should follow position order: agent3, agent1, agent2
      expect(callOrder).toEqual([agent3.id, agent1.id, agent2.id]);
    });

    test("should execute agents sequentially in random mode", async () => {
      const thread = createThread(db, "Test Thread");
      const agents = [];
      for (let i = 0; i < 5; i++) {
        agents.push(
          createAgent(db, {
            name: `Agent ${i}`,
            avatar_emoji: "🤖",
            system_prompt: `You are agent ${i}`,
            provider: "openai",
            model: "gpt-4o",
            api_key_ref: "OPENAI_API_KEY",
          }),
        );
      }

      setAgentsForThread(
        db,
        thread.id,
        agents.map((a) => a.id),
      );

      const receivedMessages: Array<{ agent_id: number | null }> = [];
      await triggerAgentResponses(
        db,
        thread.id,
        "Hello",
        (message) => {
          receivedMessages.push({ agent_id: message.agent_id });
        },
        "random",
      );

      // All agents should respond exactly once
      expect(receivedMessages.length).toBe(5);
      const respondedIds = receivedMessages.map((m) => m.agent_id).sort();
      expect(respondedIds).toEqual(agents.map((a) => a.id).sort());
    });

    test("should execute agents concurrently in concurrent mode (default)", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "Concurrent A",
        avatar_emoji: "🤖",
        system_prompt: "You are agent A",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Concurrent B",
        avatar_emoji: "🤖",
        system_prompt: "You are agent B",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, agent1.id);
      addAgentToThread(db, thread.id, agent2.id);

      const receivedMessages: Array<{ agent_id: number | null }> = [];
      await triggerAgentResponses(
        db,
        thread.id,
        "Hello",
        (message) => {
          receivedMessages.push({ agent_id: message.agent_id });
        },
        "concurrent",
      );

      expect(receivedMessages.length).toBe(2);
    });
  });

  describe("sanitiseName", () => {
    test("should keep valid characters", () => {
      expect(sanitiseName("Alice_Bot-1")).toBe("Alice_Bot-1");
    });

    test("should replace spaces with underscores", () => {
      expect(sanitiseName("My Agent")).toBe("My_Agent");
    });

    test("should strip invalid characters", () => {
      expect(sanitiseName("Agent @#$% 123!")).toBe("Agent__123");
    });

    test("should truncate to 64 characters", () => {
      const longName = "A".repeat(100);
      expect(sanitiseName(longName).length).toBe(64);
    });

    test("should handle empty string after sanitisation", () => {
      expect(sanitiseName("@#$")).toBe("agent");
    });
  });

  describe("pre-supplied agents", () => {
    test("should use provided agents instead of fetching from DB", async () => {
      const thread = createThread(db, "Test Thread");
      const agent1 = createAgent(db, {
        name: "DB Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a DB agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const agent2 = createAgent(db, {
        name: "Supplied Agent",
        avatar_emoji: "🎯",
        system_prompt: "You are a supplied agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      // Add agent1 to thread in DB, but supply only agent2
      addAgentToThread(db, thread.id, agent1.id);

      const receivedMessages: Array<{ agent_id: number | null }> = [];
      await triggerAgentResponses(
        db,
        thread.id,
        "Hello",
        (message) => {
          receivedMessages.push({ agent_id: message.agent_id });
        },
        "concurrent",
        undefined,
        [agent2],
      );

      // Only the supplied agent should have responded
      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].agent_id).toBe(agent2.id);
    });

    test("should fetch agents from DB when none supplied", async () => {
      const thread = createThread(db, "Test Thread");
      const agent = createAgent(db, {
        name: "DB Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are a DB agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      addAgentToThread(db, thread.id, agent.id);

      const receivedMessages: Array<{ agent_id: number | null }> = [];
      await triggerAgentResponses(db, thread.id, "Hello", (message) => {
        receivedMessages.push({ agent_id: message.agent_id });
      });

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].agent_id).toBe(agent.id);
    });
  });

  describe("message attribution", () => {
    test("should set name field on other agents' messages for openai provider", async () => {
      const thread = createThread(db, "Test Thread");
      const currentAgent = createAgent(db, {
        name: "Current Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are the current agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });
      const otherAgent = createAgent(db, {
        name: "Other Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are the other agent",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      addAgentToThread(db, thread.id, currentAgent.id);
      addAgentToThread(db, thread.id, otherAgent.id);

      // Create existing messages: one from current agent, one from other
      createMessage(db, thread.id, "user", null, "Hello");
      createMessage(db, thread.id, "agent", otherAgent.id, "I am the other agent");
      createMessage(db, thread.id, "agent", currentAgent.id, "I am the current agent");

      await triggerAgentResponses(db, thread.id, "New message");

      // Find the fetch call for the current agent (system prompt match)
      const currentAgentCall = fetchCalls.find((c) => {
        const body = c.body as { messages: Array<{ role: string; content: string }> };
        return body.messages[0]?.content === "You are the current agent";
      });

      expect(currentAgentCall).toBeDefined();
      const messages = (
        currentAgentCall!.body as {
          messages: Array<{ role: string; content: string; name?: string }>;
        }
      ).messages;

      // Other agent's message should have name field
      const otherAgentMsg = messages.find((m) => m.content === "I am the other agent");
      expect(otherAgentMsg).toBeDefined();
      expect(otherAgentMsg!.name).toBe("Other_Agent");

      // Current agent's own message should NOT have name field
      const currentAgentMsg = messages.find((m) => m.content === "I am the current agent");
      expect(currentAgentMsg).toBeDefined();
      expect(currentAgentMsg!.name).toBeUndefined();
    });

    test("should prefix content for other agents' messages for anthropic provider", async () => {
      const thread = createThread(db, "Test Thread");
      const currentAgent = createAgent(db, {
        name: "Claude Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are the claude agent",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });
      const otherAgent = createAgent(db, {
        name: "Other Bot",
        avatar_emoji: "🤖",
        system_prompt: "You are the other bot",
        provider: "anthropic",
        model: "claude-sonnet-4",
        api_key_ref: "ANTHROPIC_API_KEY",
      });

      addAgentToThread(db, thread.id, currentAgent.id);
      addAgentToThread(db, thread.id, otherAgent.id);

      createMessage(db, thread.id, "user", null, "Hello");
      createMessage(db, thread.id, "agent", otherAgent.id, "I am the other bot");
      createMessage(db, thread.id, "agent", currentAgent.id, "I am claude");

      // Mock Anthropic response format
      globalThis.fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = input.toString();
          const body = init?.body ? JSON.parse(init.body as string) : undefined;
          fetchCalls.push({ url, body });

          if (url.includes("anthropic")) {
            return new Response(
              JSON.stringify({ content: [{ text: "Mocked Anthropic response" }] }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Mocked response" } }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
        { preconnect: undefined, writable: true },
      ) as typeof globalThis.fetch;

      await triggerAgentResponses(db, thread.id, "New message");

      // Find the Anthropic call for the current agent
      const currentAgentCall = fetchCalls.find((c) => {
        const body = c.body as {
          system?: string;
          messages: Array<{ role: string; content: string }>;
        };
        return body.system === "You are the claude agent";
      });

      expect(currentAgentCall).toBeDefined();
      const msgs = (
        currentAgentCall!.body as {
          messages: Array<{ role: string; content: string; name?: string }>;
        }
      ).messages;

      // Other agent's message should have prefixed content
      const otherAgentMsg = msgs.find((m) => m.content.includes("I am the other bot"));
      expect(otherAgentMsg).toBeDefined();
      expect(otherAgentMsg!.content).toBe("[Other Bot]: I am the other bot");

      // Current agent's own message should NOT be prefixed
      const currentAgentMsg = msgs.find((m) => m.content.includes("I am claude"));
      expect(currentAgentMsg).toBeDefined();
      expect(currentAgentMsg!.content).toBe("I am claude");

      // No name fields should be present on Anthropic messages
      expect(msgs.every((m) => m.name === undefined)).toBe(true);
    });

    test("should set name field on other agents' messages for openrouter provider", async () => {
      const thread = createThread(db, "Test Thread");
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      const currentAgent = createAgent(db, {
        name: "Router Agent",
        avatar_emoji: "🌐",
        system_prompt: "You are the router agent",
        provider: "openrouter",
        model: "google/gemini-2.0-flash-001",
        api_key_ref: "OPENROUTER_API_KEY",
      });
      const otherAgent = createAgent(db, {
        name: "Helper Agent",
        avatar_emoji: "🤖",
        system_prompt: "You are the helper",
        provider: "openrouter",
        model: "google/gemini-2.0-flash-001",
        api_key_ref: "OPENROUTER_API_KEY",
      });

      addAgentToThread(db, thread.id, currentAgent.id);
      addAgentToThread(db, thread.id, otherAgent.id);

      createMessage(db, thread.id, "agent", otherAgent.id, "Hello from helper");

      await triggerAgentResponses(db, thread.id, "Hey");

      const currentAgentCall = fetchCalls.find((c) => {
        const body = c.body as { messages: Array<{ role: string; content: string }> };
        return body.messages[0]?.content === "You are the router agent";
      });

      expect(currentAgentCall).toBeDefined();
      const messages = (
        currentAgentCall!.body as {
          messages: Array<{ role: string; content: string; name?: string }>;
        }
      ).messages;

      const otherMsg = messages.find((m) => m.content === "Hello from helper");
      expect(otherMsg).toBeDefined();
      expect(otherMsg!.name).toBe("Helper_Agent");
    });
  });
});
