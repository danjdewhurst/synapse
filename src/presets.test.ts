import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, createAgent, listAgents, type Agent } from "./db";
import { presets, seedPresets, handleListPresets, handleCreateFromPreset } from "./presets";

describe("Presets", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("seedPresets", () => {
    test("should seed all presets when database has no agents", () => {
      seedPresets(db);

      const agents = listAgents(db);
      expect(agents).toHaveLength(presets.length);

      for (const preset of presets) {
        const match = agents.find((a) => a.name === preset.name);
        expect(match).toBeDefined();
        expect(match!.avatar_emoji).toBe(preset.avatar_emoji);
        expect(match!.provider).toBe(preset.provider);
        expect(match!.model).toBe(preset.model);
        expect(match!.api_key_ref).toBe(preset.api_key_ref);
      }
    });

    test("should skip seeding when agents already exist", () => {
      createAgent(db, {
        name: "Existing Agent",
        avatar_emoji: "🤖",
        system_prompt: "Test",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      seedPresets(db);

      const agents = listAgents(db);
      expect(agents).toHaveLength(1);
      expect(agents[0]!.name).toBe("Existing Agent");
    });

    test("should be idempotent — calling twice does not duplicate agents", () => {
      seedPresets(db);
      seedPresets(db);

      const agents = listAgents(db);
      expect(agents).toHaveLength(presets.length);
    });
  });

  describe("GET /api/presets", () => {
    test("should return all presets", async () => {
      const request = new Request("http://localhost/api/presets");
      const response = await handleListPresets(db, request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(presets.length);
      expect(body[0].name).toBe("Reasoner");
      expect(body[0].avatar_emoji).toBe("🧠");
    });
  });

  describe("POST /api/presets/:index", () => {
    test("should create an agent from a valid preset index", async () => {
      const request = new Request("http://localhost/api/presets/0", { method: "POST" });
      const response = await handleCreateFromPreset(db, request, 0);

      expect(response.status).toBe(201);
      const body = (await response.json()) as Agent;
      expect(body.name).toBe("Reasoner");
      expect(body.avatar_emoji).toBe("🧠");
      expect(body.provider).toBe("openrouter");
      expect(body.model).toBe("moonshotai/kimi-k2.5");
      expect(body.is_active).toBe(true);
    });

    test("should return 400 for negative index", async () => {
      const request = new Request("http://localhost/api/presets/-1", { method: "POST" });
      const response = await handleCreateFromPreset(db, request, -1);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid preset index");
    });

    test("should return 400 for out-of-range index", async () => {
      const request = new Request("http://localhost/api/presets/100", { method: "POST" });
      const response = await handleCreateFromPreset(db, request, 100);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid preset index");
    });

    test("should return 409 when preset agent name already exists", async () => {
      // Create agent with same name as first preset
      createAgent(db, {
        name: presets[0]!.name,
        avatar_emoji: "🤖",
        system_prompt: "Test",
        provider: "openai",
        model: "gpt-4o",
        api_key_ref: "OPENAI_API_KEY",
      });

      const request = new Request("http://localhost/api/presets/0", { method: "POST" });
      const response = await handleCreateFromPreset(db, request, 0);

      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("already exists");
    });
  });
});
