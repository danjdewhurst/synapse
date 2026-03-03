// Shared types for frontend and backend

export interface Thread {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  thread_id: number;
  role: "user" | "agent";
  agent_id: number | null;
  agent_name: string | null;
  agent_avatar_emoji: string | null;
  content: string;
  status: "complete" | "error";
  created_at: string;
}

export interface Agent {
  id: number;
  name: string;
  avatar_emoji: string;
  system_prompt: string;
  provider: "openai" | "anthropic" | "openrouter";
  model: string;
  api_key_ref: string;
  temperature: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateAgentInput {
  name: string;
  avatar_emoji: string;
  system_prompt: string;
  provider: "openai" | "anthropic" | "openrouter";
  model: string;
  api_key_ref: string;
  temperature?: number;
}

export interface WebSocketMessage {
  type: "message" | "typing" | "error";
  message?: Message;
  agents?: boolean;
  error?: string;
}
