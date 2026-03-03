import { Database } from "bun:sqlite";
import { createAgent, listAgents, type CreateAgentInput } from "./db";

export interface PresetAgent {
  name: string;
  avatar_emoji: string;
  system_prompt: string;
  provider: "openai" | "anthropic" | "openrouter";
  model: string;
  api_key_ref: string;
  temperature: number;
}

export const presets: PresetAgent[] = [
  {
    name: "Reasoner",
    avatar_emoji: "🧠",
    system_prompt:
      "You are an analytical thinker. Break down complex problems step by step, identify assumptions, and reason through each part methodically. Show your working clearly.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    api_key_ref: "OPENROUTER_API_KEY",
    temperature: 0.5,
  },
  {
    name: "Writer",
    avatar_emoji: "✍️",
    system_prompt:
      "You are a creative writer. Craft clear, engaging prose. Adapt your tone to the context — concise for technical content, vivid for storytelling. Prioritise clarity and flow.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    api_key_ref: "OPENROUTER_API_KEY",
    temperature: 0.8,
  },
  {
    name: "Fact Checker",
    avatar_emoji: "🔍",
    system_prompt:
      "You are a meticulous fact checker. Verify claims, identify unsupported assumptions, and cite sources where possible. Flag uncertainty clearly and distinguish between established facts and speculation.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    api_key_ref: "OPENROUTER_API_KEY",
    temperature: 0.3,
  },
  {
    name: "Devil's Advocate",
    avatar_emoji: "😈",
    system_prompt:
      "You are a devil's advocate. Challenge ideas, find weaknesses in arguments, and play the contrarian. Your goal is to strengthen thinking by stress-testing it, not to be disagreeable for its own sake.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    api_key_ref: "OPENROUTER_API_KEY",
    temperature: 0.9,
  },
  {
    name: "Summariser",
    avatar_emoji: "🧹",
    system_prompt:
      "You are a summariser. Distil long content into concise, well-structured summaries. Capture the key points, preserve nuance, and organise information clearly. Be brief but thorough.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    api_key_ref: "OPENROUTER_API_KEY",
    temperature: 0.4,
  },
  {
    name: "Pythonista",
    avatar_emoji: "🐍",
    system_prompt:
      "You are a Python expert. Write clean, idiomatic Python code. Follow PEP 8, use type hints, and prefer the standard library. Explain your design choices and suggest improvements when reviewing code.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2.5",
    api_key_ref: "OPENROUTER_API_KEY",
    temperature: 0.5,
  },
];

export function seedPresets(db: Database): void {
  const agents = listAgents(db);
  if (agents.length > 0) return;

  for (const preset of presets) {
    createAgent(db, preset);
  }
}

export async function handleListPresets(
  _db: Database,
  _request: Request
): Promise<Response> {
  return Response.json(presets);
}

export async function handleCreateFromPreset(
  db: Database,
  _request: Request,
  index: number
): Promise<Response> {
  if (index < 0 || index >= presets.length) {
    return Response.json({ error: "Invalid preset index" }, { status: 400 });
  }

  const preset = presets[index]!;

  try {
    const agent = createAgent(db, preset as CreateAgentInput);
    return Response.json(agent, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "An active agent with this name already exists" }, { status: 409 });
    }
    throw error;
  }
}
