import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, createAgent, type Agent } from "./db";
import {
  handleListAgents,
  handleCreateAgent,
  handleGetAgent,
  handleUpdateAgent,
  handleDeleteAgent,
} from "./agents";

const TEST_DB_PATH = ":memory:";

const validAgentInput = {
  name: "Test Agent",
  avatar_emoji: "🤖",
  system_prompt: "You are a helpful assistant",
  provider: "openai" as const,
  model: "gpt-4o",
  api_key_ref: "OPENAI_API_KEY",
  temperature: 0.7,
};

describe("Agents API", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    initDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /api/agents", () => {
    test("should return empty array when no agents exist", async () => {
      const request = new Request("http://localhost/api/agents");
      const response = await handleListAgents(db, request);

      expect(response.status).toBe(200);
      const body = await response.json() as Agent[];
      expect(body).toEqual([]);
    });

    test("should return list of agents ordered by created_at", async () => {
      createAgent(db, validAgentInput);
      createAgent(db, { ...validAgentInput, name: "Agent 2" });

      const request = new Request("http://localhost/api/agents");
      const response = await handleListAgents(db, request);

      expect(response.status).toBe(200);
      const body = await response.json() as Agent[];
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("Agent 2");
      expect(body[1].name).toBe("Test Agent");
    });
  });

  describe("POST /api/agents", () => {
    test("should create a new agent with all fields", async () => {
      const request = new Request("http://localhost/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validAgentInput),
      });

      const response = await handleCreateAgent(db, request);

      expect(response.status).toBe(201);
      const body = await response.json() as Agent;
      expect(body.id).toBeDefined();
      expect(body.name).toBe("Test Agent");
      expect(body.avatar_emoji).toBe("🤖");
      expect(body.system_prompt).toBe("You are a helpful assistant");
      expect(body.provider).toBe("openai");
      expect(body.model).toBe("gpt-4o");
      expect(body.api_key_ref).toBe("OPENAI_API_KEY");
      expect(body.temperature).toBe(0.7);
      expect(body.is_active).toBe(true);
    });

    test("should create an agent with default temperature", async () => {
      const { temperature: _, ...inputWithoutTemp } = validAgentInput;
      const request = new Request("http://localhost/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputWithoutTemp),
      });

      const response = await handleCreateAgent(db, request);

      expect(response.status).toBe(201);
      const body = await response.json() as Agent;
      expect(body.temperature).toBe(0.7);
    });

    test("should return 400 when required fields are missing", async () => {
      const request = new Request("http://localhost/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      const response = await handleCreateAgent(db, request);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("required");
    });

    test("should return 400 for invalid provider", async () => {
      const request = new Request("http://localhost/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validAgentInput, provider: "invalid" }),
      });

      const response = await handleCreateAgent(db, request);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("provider");
    });

    test("should return 400 for invalid JSON", async () => {
      const request = new Request("http://localhost/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json",
      });

      const response = await handleCreateAgent(db, request);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid JSON");
    });
  });

  describe("GET /api/agents/:id", () => {
    test("should return agent by id", async () => {
      const agent = createAgent(db, validAgentInput);

      const request = new Request(`http://localhost/api/agents/${agent.id}`);
      const response = await handleGetAgent(db, request, agent.id);

      expect(response.status).toBe(200);
      const body = await response.json() as Agent;
      expect(body.id).toBe(agent.id);
      expect(body.name).toBe("Test Agent");
    });

    test("should return 404 for non-existent agent", async () => {
      const request = new Request("http://localhost/api/agents/999");
      const response = await handleGetAgent(db, request, 999);

      expect(response.status).toBe(404);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Agent not found");
    });
  });

  describe("PUT /api/agents/:id", () => {
    test("should update an agent", async () => {
      const agent = createAgent(db, validAgentInput);

      const request = new Request(`http://localhost/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Agent", temperature: 0.5 }),
      });

      const response = await handleUpdateAgent(db, request, agent.id);

      expect(response.status).toBe(200);
      const body = await response.json() as Agent;
      expect(body.name).toBe("Updated Agent");
      expect(body.temperature).toBe(0.5);
      expect(body.system_prompt).toBe("You are a helpful assistant"); // unchanged
    });

    test("should return 404 for non-existent agent", async () => {
      const request = new Request("http://localhost/api/agents/999", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });

      const response = await handleUpdateAgent(db, request, 999);

      expect(response.status).toBe(404);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Agent not found");
    });

    test("should return 400 for invalid provider", async () => {
      const agent = createAgent(db, validAgentInput);

      const request = new Request(`http://localhost/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "invalid" }),
      });

      const response = await handleUpdateAgent(db, request, agent.id);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain("provider");
    });
  });

  describe("DELETE /api/agents/:id", () => {
    test("should soft-delete an agent", async () => {
      const agent = createAgent(db, validAgentInput);

      const request = new Request(`http://localhost/api/agents/${agent.id}`, {
        method: "DELETE",
      });

      const response = await handleDeleteAgent(db, request, agent.id);

      expect(response.status).toBe(204);

      // Verify agent is marked inactive
      const getRequest = new Request(`http://localhost/api/agents/${agent.id}`);
      const getResponse = await handleGetAgent(db, getRequest, agent.id);
      const body = await getResponse.json() as Agent;
      expect(body.is_active).toBe(false);
    });

    test("should return 404 for non-existent agent", async () => {
      const request = new Request("http://localhost/api/agents/999", {
        method: "DELETE",
      });

      const response = await handleDeleteAgent(db, request, 999);

      expect(response.status).toBe(404);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Agent not found");
    });
  });
});
