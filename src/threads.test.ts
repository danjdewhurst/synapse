import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb, createThread, type Thread } from "./db";
import { handleListThreads, handleCreateThread, handleGetThread } from "./threads";

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
      const body = await response.json() as unknown[];
      expect(body).toEqual([]);
    });

    test("should return list of threads ordered by updated_at", async () => {
      const thread1 = createThread(db, "Thread 1");
      const thread2 = createThread(db, "Thread 2");

      const request = new Request("http://localhost/api/threads");
      const response = await handleListThreads(db, request);

      expect(response.status).toBe(200);
      const body = await response.json() as Thread[];
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
      const body = await response.json() as Thread;
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
      const body = await response.json() as { error: string };
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
      const body = await response.json() as { error: string };
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
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Invalid JSON");
    });
  });

  describe("GET /api/threads/:id", () => {
    test("should return thread by id", async () => {
      const thread = createThread(db, "Test Thread");

      const request = new Request(`http://localhost/api/threads/${thread.id}`);
      const response = await handleGetThread(db, request, thread.id);

      expect(response.status).toBe(200);
      const body = await response.json() as Thread;
      expect(body.id).toBe(thread.id);
      expect(body.title).toBe("Test Thread");
    });

    test("should return 404 for non-existent thread", async () => {
      const request = new Request("http://localhost/api/threads/999");
      const response = await handleGetThread(db, request, 999);

      expect(response.status).toBe(404);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Thread not found");
    });
  });
});
