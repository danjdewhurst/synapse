import { Database } from "bun:sqlite";
import { getAgentsForThread, createMessage, getMessages, type Agent, type Message } from "./db";

export type OnMessageCallback = (message: Message) => void;

export const MAX_CONTEXT_MESSAGES = 50;

interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function callOpenAI(agent: Agent, messages: ChatCompletionMessage[]): Promise<string> {
  const apiKey = process.env[agent.api_key_ref];
  if (!apiKey) {
    throw new Error(`API key not found: ${agent.api_key_ref}`);
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: agent.model,
      messages,
      temperature: agent.temperature,
    }),
  });

  if (!response.ok) {
    throw new ApiError(
      `OpenAI API error: ${response.status}`,
      response.status,
      parseRetryAfter(response)
    );
  }

  const data = await response.json() as {
    choices: [{ message: { content: string } }];
  };
  return data.choices[0].message.content;
}

async function callAnthropic(agent: Agent, messages: ChatCompletionMessage[]): Promise<string> {
  const apiKey = process.env[agent.api_key_ref];
  if (!apiKey) {
    throw new Error(`API key not found: ${agent.api_key_ref}`);
  }

  // Separate system message from conversation
  const systemMessage = messages.find(m => m.role === "system")?.content;
  const conversationMessages = messages.filter(m => m.role !== "system");

  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: agent.model,
      max_tokens: 4096,
      system: systemMessage,
      messages: conversationMessages,
      temperature: agent.temperature,
    }),
  });

  if (!response.ok) {
    throw new ApiError(
      `Anthropic API error: ${response.status}`,
      response.status,
      parseRetryAfter(response)
    );
  }

  const data = await response.json() as {
    content: [{ text: string }];
  };
  return data.content[0].text;
}

async function callOpenRouter(agent: Agent, messages: ChatCompletionMessage[]): Promise<string> {
  const apiKey = process.env[agent.api_key_ref];
  if (!apiKey) {
    throw new Error(`API key not found: ${agent.api_key_ref}`);
  }

  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api";
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: agent.model,
      messages,
      temperature: agent.temperature,
    }),
  });

  if (!response.ok) {
    throw new ApiError(
      `OpenRouter API error: ${response.status}`,
      response.status,
      parseRetryAfter(response)
    );
  }

  const data = await response.json() as {
    choices: [{ message: { content: string } }];
  };
  return data.choices[0].message.content;
}

async function callAgentWithRetry(
  agent: Agent,
  messages: ChatCompletionMessage[],
  maxRetries = 3
): Promise<{ content: string; status: "complete" | "error" }> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let content: string;

      if (agent.provider === "openai") {
        content = await callOpenAI(agent, messages);
      } else if (agent.provider === "openrouter") {
        content = await callOpenRouter(agent, messages);
      } else {
        content = await callAnthropic(agent, messages);
      }

      return { content, status: "complete" };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on authentication errors
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        break;
      }

      // Use Retry-After header if available, otherwise exponential backoff
      if (attempt < maxRetries - 1) {
        const retryAfter = error instanceof ApiError ? error.retryAfter : undefined;
        const delayMs = retryAfter !== undefined
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  return {
    content: `Error: ${lastError?.message ?? "Unknown error"}`,
    status: "error",
  };
}

function buildConversationHistory(
  db: Database,
  threadId: number,
  agent: Agent,
  newUserMessage: string
): ChatCompletionMessage[] {
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: agent.system_prompt },
  ];

  // Get existing messages from thread, limited to recent context
  const allMessages = getMessages(db, threadId);
  const existingMessages = allMessages.slice(-MAX_CONTEXT_MESSAGES);

  for (const msg of existingMessages) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "agent") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  // Add the new user message
  messages.push({ role: "user", content: newUserMessage });

  return messages;
}

export async function triggerAgentResponses(
  db: Database,
  threadId: number,
  userMessage: string,
  onMessage?: OnMessageCallback
): Promise<void> {
  const agents = getAgentsForThread(db, threadId);

  if (agents.length === 0) {
    return;
  }

  // Trigger all agents concurrently
  const promises = agents.map(async (agent) => {
    const messages = buildConversationHistory(db, threadId, agent, userMessage);
    const result = await callAgentWithRetry(agent, messages);

    const message = createMessage(db, threadId, "agent", agent.id, result.content, result.status);
    onMessage?.(message);
  });

  await Promise.all(promises);
}
