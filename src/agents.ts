import { Database } from "bun:sqlite";
import { createAgent, getAgent, listAgents, updateAgent, deleteAgent, type CreateAgentInput } from "./db";

const VALID_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;

function validateAgentInput(body: Record<string, unknown>): { error?: string; input?: CreateAgentInput } {
  const requiredFields = ["name", "avatar_emoji", "system_prompt", "provider", "model", "api_key_ref"];

  for (const field of requiredFields) {
    if (!body[field] || (typeof body[field] === "string" && !body[field].toString().trim())) {
      return { error: `${field} is required` };
    }
  }

  const provider = body.provider as string;
  if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
    return { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` };
  }

  const temperature = body.temperature !== undefined ? Number(body.temperature) : 0.7;

  return {
    input: {
      name: String(body.name),
      avatar_emoji: String(body.avatar_emoji),
      system_prompt: String(body.system_prompt),
      provider: provider as "openai" | "anthropic" | "openrouter",
      model: String(body.model),
      api_key_ref: String(body.api_key_ref),
      temperature,
    },
  };
}

export async function handleListAgents(
  db: Database,
  _request: Request
): Promise<Response> {
  const agents = listAgents(db);
  return Response.json(agents);
}

export async function handleCreateAgent(
  db: Database,
  request: Request
): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { error, input } = validateAgentInput(body);

    if (error || !input) {
      return Response.json({ error: error ?? "Invalid input" }, { status: 400 });
    }

    const agent = createAgent(db, input);
    return Response.json(agent, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "An active agent with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function handleGetAgent(
  db: Database,
  _request: Request,
  id: number
): Promise<Response> {
  const agent = getAgent(db, id);

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  return Response.json(agent);
}

export async function handleUpdateAgent(
  db: Database,
  request: Request,
  id: number
): Promise<Response> {
  // Verify agent exists
  const existing = getAgent(db, id);
  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;

    // Validate provider if provided
    if (body.provider !== undefined) {
      if (!VALID_PROVIDERS.includes(body.provider as typeof VALID_PROVIDERS[number])) {
        return Response.json(
          { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const updates: Parameters<typeof updateAgent>[2] = {};

    if (body.name !== undefined) updates.name = String(body.name);
    if (body.avatar_emoji !== undefined) updates.avatar_emoji = String(body.avatar_emoji);
    if (body.system_prompt !== undefined) updates.system_prompt = String(body.system_prompt);
    if (body.provider !== undefined) updates.provider = body.provider as "openai" | "anthropic" | "openrouter";
    if (body.model !== undefined) updates.model = String(body.model);
    if (body.api_key_ref !== undefined) updates.api_key_ref = String(body.api_key_ref);
    if (body.temperature !== undefined) updates.temperature = Number(body.temperature);

    const agent = updateAgent(db, id, updates);

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    return Response.json(agent);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "An active agent with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function handleDeleteAgent(
  db: Database,
  _request: Request,
  id: number
): Promise<Response> {
  // Verify agent exists
  const existing = getAgent(db, id);
  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  deleteAgent(db, id);
  return new Response(null, { status: 204 });
}
