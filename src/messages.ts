import { Database } from "bun:sqlite";
import { createMessage, getMessages, getThread } from "./db";

export async function handleAddMessage(
  db: Database,
  request: Request,
  threadId: number
): Promise<Response> {
  // Verify thread exists
  const thread = getThread(db, threadId);
  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    const body = await request.json() as { content?: string; agent_id?: number };
    const content = body.content?.trim();

    if (!content) {
      return Response.json({ error: "Content is required" }, { status: 400 });
    }

    const agentId = body.agent_id ?? null;
    const role = agentId ? "agent" : "user";

    const message = createMessage(db, threadId, role, agentId, content);
    return Response.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw error;
  }
}

export async function handleGetMessages(
  db: Database,
  _request: Request,
  threadId: number
): Promise<Response> {
  // Verify thread exists
  const thread = getThread(db, threadId);
  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const messages = getMessages(db, threadId);
  return Response.json(messages);
}
