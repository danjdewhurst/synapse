import { Database } from "bun:sqlite";
import { getAgentsForThread, createMessage, getMessages, type Agent, type Message } from "./db";

interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenAI(agent: Agent, messages: ChatCompletionMessage[]): Promise<string> {
  const apiKey = process.env[agent.api_key_ref];
  if (!apiKey) {
    throw new Error(`API key not found: ${agent.api_key_ref}`);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    throw new Error(`OpenAI API error: ${response.status}`);
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json() as {
    content: [{ text: string }];
  };
  return data.content[0].text;
}

async function callAgentWithRetry(
  db: Database,
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
      } else {
        content = await callAnthropic(agent, messages);
      }

      return { content, status: "complete" };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on authentication errors
      if (lastError.message.includes("401") || lastError.message.includes("403")) {
        break;
      }

      // Exponential backoff: wait 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
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

  // Get existing messages from thread
  const existingMessages = getMessages(db, threadId);

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
  userMessage: string
): Promise<void> {
  const agents = getAgentsForThread(db, threadId);

  if (agents.length === 0) {
    return;
  }

  // Trigger all agents concurrently
  const promises = agents.map(async (agent) => {
    const messages = buildConversationHistory(db, threadId, agent, userMessage);
    const result = await callAgentWithRetry(db, agent, messages);

    createMessage(db, threadId, "agent", agent.id, result.content);
  });

  await Promise.all(promises);
}
