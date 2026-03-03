import type { Thread, Message, Agent, CreateAgentInput } from "./types";

const API_BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Threads
export async function listThreads(): Promise<Thread[]> {
  return fetchJson<Thread[]>(`${API_BASE}/threads`);
}

export async function createThread(title: string): Promise<Thread> {
  return fetchJson<Thread>(`${API_BASE}/threads`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function getThread(id: number): Promise<Thread> {
  return fetchJson<Thread>(`${API_BASE}/threads/${id}`);
}

// Thread Agents
export async function getThreadAgents(threadId: number): Promise<Agent[]> {
  return fetchJson<Agent[]>(`${API_BASE}/threads/${threadId}/agents`);
}

export async function setThreadAgents(threadId: number, agentIds: number[]): Promise<Agent[]> {
  return fetchJson<Agent[]>(`${API_BASE}/threads/${threadId}/agents`, {
    method: "PUT",
    body: JSON.stringify({ agent_ids: agentIds }),
  });
}

// Messages
export async function getMessages(
  threadId: number,
  options?: { limit?: number; offset?: number }
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined) params.set("offset", String(options.offset));
  const query = params.toString();
  return fetchJson<Message[]>(`${API_BASE}/threads/${threadId}/messages${query ? `?${query}` : ""}`);
}

export async function addMessage(threadId: number, content: string): Promise<Message> {
  return fetchJson<Message>(`${API_BASE}/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// Agents
export async function listAgents(): Promise<Agent[]> {
  return fetchJson<Agent[]>(`${API_BASE}/agents`);
}

export async function createAgent(agent: CreateAgentInput): Promise<Agent> {
  return fetchJson<Agent>(`${API_BASE}/agents`, {
    method: "POST",
    body: JSON.stringify(agent),
  });
}

export async function updateAgent(id: number, updates: Partial<CreateAgentInput>): Promise<Agent> {
  return fetchJson<Agent>(`${API_BASE}/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function deleteAgent(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}
