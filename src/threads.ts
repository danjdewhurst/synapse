import type { Database } from "bun:sqlite";
import {
  createThread,
  getAgent,
  getAgentsForThread,
  getThread,
  listThreads,
  type ResponseMode,
  setAgentsForThread,
  updateThread,
} from "./db";

export async function handleListThreads(db: Database, _request: Request): Promise<Response> {
  const threads = listThreads(db);
  return Response.json(threads);
}

export async function handleCreateThread(db: Database, request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { title?: string };
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

const VALID_RESPONSE_MODES: ResponseMode[] = ["concurrent", "random", "ordered"];

export async function handleUpdateThread(
  db: Database,
  request: Request,
  id: number,
): Promise<Response> {
  const existing = getThread(db, id);
  if (!existing) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { response_mode?: string };

    if (
      body.response_mode !== undefined &&
      !VALID_RESPONSE_MODES.includes(body.response_mode as ResponseMode)
    ) {
      return Response.json(
        { error: "Invalid response_mode. Must be concurrent, random, or ordered" },
        { status: 400 },
      );
    }

    const updated = updateThread(db, id, {
      response_mode: body.response_mode as ResponseMode | undefined,
    });

    return Response.json(updated);
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
  id: number,
): Promise<Response> {
  const thread = getThread(db, id);

  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  return Response.json(thread);
}

export async function handleGetThreadAgents(
  db: Database,
  _request: Request,
  threadId: number,
): Promise<Response> {
  const thread = getThread(db, threadId);
  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const agents = getAgentsForThread(db, threadId);
  return Response.json(agents);
}

export async function handleSetThreadAgents(
  db: Database,
  request: Request,
  threadId: number,
): Promise<Response> {
  const thread = getThread(db, threadId);
  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { agent_ids?: unknown };

    if (!Array.isArray(body.agent_ids)) {
      return Response.json({ error: "agent_ids must be an array" }, { status: 400 });
    }

    const agentIds = body.agent_ids as number[];

    // Validate all agents exist and are active
    for (const id of agentIds) {
      const agent = getAgent(db, id);
      if (!agent || !agent.is_active) {
        return Response.json({ error: `Agent ${id} not found or inactive` }, { status: 400 });
      }
    }

    setAgentsForThread(db, threadId, agentIds);
    const agents = getAgentsForThread(db, threadId);
    return Response.json(agents);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw error;
  }
}
