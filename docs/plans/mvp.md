# Synapse MVP Plan

Multi-agent chatroom where AI personas collaborate in threaded conversations.

## Core Concepts

- **Thread**: A chat conversation with a topic
- **Message**: A user or agent message within a thread
- **Agent**: An AI persona with model configuration and behavioural instructions
- **Orchestration**: How agents respond (simultaneous, sequential, conditional)

## Phase 1: Foundation

### Database Schema (Bun SQLite)

```sql
-- threads
- id: integer primary key
- title: text
- created_at: datetime
- updated_at: datetime

-- messages
- id: integer primary key
- thread_id: integer foreign key
- role: text -- 'user' | 'agent'
- agent_id: integer nullable -- null for user messages
- content: text
- status: text -- 'complete' | 'error' (for agent messages)
- created_at: datetime

-- agents
- id: integer primary key
- name: text
- avatar_emoji: text -- simple visual identifier
- system_prompt: text
- provider: text -- 'openai' | 'anthropic'
- model: text -- 'gpt-4o', 'claude-sonnet-4', etc.
- api_key: text -- encrypted or env-ref
- temperature: float
- is_active: boolean
- created_at: datetime

-- thread_agents (which agents participate in which threads)
- thread_id: integer
- agent_id: integer
```

### Backend (Bun.serve)

Single `Bun.serve()` instance handles both HTTP and WebSocket:

```ts
Bun.serve({
  routes: {
    "/api/threads": { GET: listThreads, POST: createThread },
    "/api/threads/:id": { GET: getThread },
    "/api/threads/:id/messages": { POST: addMessage },
    "/api/agents": { GET: listAgents, POST: createAgent },
    "/api/agents/:id": { PUT: updateAgent, DELETE: deleteAgent },
    "/": index,
  },
  websocket: {
    open: (ws) => { /* join thread room */ },
    message: (ws, msg) => { /* handle client messages */ },
    close: (ws) => { /* leave room */ },
  },
})
```

- WebSocket upgrade handled transparently by Bun
- Clients join "thread rooms" to receive broadcasts
- Agent responses triggered on user messages, streamed via WebSocket

### Frontend (React + Bun HTML Imports)

Zero build step. Bun handles TSX bundling and HMR automatically.

```html
<!-- public/index.html -->
<script type="module" src="./app.tsx"></script>
```

```tsx
// public/app.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// Standard React component structure
function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  // ...
}
```

- **Layout**: Sidebar (threads list) + Main (active thread)
- **Components**:
  - `ThreadList` — sidebar with thread items
  - `ThreadView` — message history + input, with infinite scroll (load older messages on scroll up)
  - `AgentManager` — CRUD for agents
  - `MessageBubble` — individual message display with markdown support
  - `TypingIndicator` — shows which agents are generating responses
- **WebSocket handling**: Auto-reconnect on disconnect, re-fetch missed messages

### Agent Orchestration (MVP: Simple)

When a user sends a message:

1. Save message to DB
2. Broadcast to all WebSocket clients in thread
3. Trigger agent responses concurrently:
   - Fetch all agents configured for this thread
   - Fire requests in parallel (Promise.all)
4. **Typing indicators**: Broadcast "typing" event when agent starts, then stream tokens
5. Save each completed response to DB (partial streams not persisted)
6. **Retry logic**: 3 attempts per agent, then display error message in chat

**Notes**:
- Sequential/ordered orchestration deferred to Phase 3
- Agents only see completed messages from other agents (not in-progress streams)
- Responses support markdown rendering

## Phase 2: Polish

- Agent mentions (@agentname to trigger specific agents)
- Message streaming (show typing indicator, stream tokens)
- Markdown rendering for messages
- Thread search
- Export conversation

## Phase 3: Advanced Orchestration

- Conditional triggers (agent responds only if mentioned/matches pattern)
- Agent-to-agent replies (agent A can trigger agent B)
- Conversation memory/summarisation for long threads

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| Database | Bun SQLite (`bun:sqlite`) |
| Server | `Bun.serve()` with routes |
| WebSocket | Built into `Bun.serve()` |
| Frontend | React + TypeScript (bundled by Bun) |
| Styling | Pico.css or similar classless framework |

## File Structure

```
synapse/
├── src/
│   ├── index.ts       # Bun.serve() with routes + WebSocket
│   ├── db.ts          # Database setup, migrations
│   ├── agents.ts      # Agent execution logic
│   └── types.ts       # Shared TypeScript types
├── public/
│   ├── index.html     # Entry HTML
│   ├── app.tsx        # Main React app (imported directly)
│   └── styles.css
├── docs/plans/
│   └── mvp.md         # This file
└── package.json
```

## API Keys

For MVP: store in environment variables, reference by name in agent config.

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Agent record stores `api_key_ref: 'OPENAI_API_KEY'` rather than the key itself.

## Open Questions (Resolved)

1. **Agent visibility** — Agents see only completed messages (not streaming in-progress)
2. **Typing indicators** — Show while agents are generating responses
3. **Rate limiting** — Ignored for MVP
4. **WebSocket reconnection** — Auto-retry with re-fetch of missed messages
5. **Message history** — Dynamic loading: start with latest, load older on scroll up
6. **Agent errors** — 3 retries, then display error message from agent in chat
7. **Markdown rendering** — Yes, agent responses support markdown

## Success Criteria

- [ ] Create thread, see it in sidebar
- [ ] Send message, see it appear
- [ ] Configure agent with model/provider/prompt
- [ ] Agent responds automatically in thread
- [ ] Multiple agents can respond to same message
- [ ] All messages persist on refresh
