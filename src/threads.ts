import { Database } from "bun:sqlite";
import { createThread, getThread, listThreads } from "./db";

export async function handleListThreads(
  db: Database,
  _request: Request
): Promise<Response> {
  const threads = listThreads(db);
  return Response.json(threads);
}

export async function handleCreateThread(
  db: Database,
  request: Request
): Promise<Response> {
  try {
    const body = await request.json() as { title?: string };
    const title = body.title?.trim();

    if (!title) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    const thread = createThread(db, title);
    return Response.json(thread, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw error;
  }
}

export async function handleGetThread(
  db: Database,
  _request: Request,
  id: number
): Promise<Response> {
  const thread = getThread(db, id);

  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  return Response.json(thread);
}
