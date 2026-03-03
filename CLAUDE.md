# Synapse

Multi-agent chatroom where AI personas collaborate in real-time threaded conversations. Users create threads, assign AI agents with custom system prompts and models, and agents respond concurrently via WebSocket.

## Tech Stack

- **Runtime:** Bun (use `bun` for everything — no Node.js, npm, vite, express, dotenv)
- **Database:** SQLite via `bun:sqlite` (file: `synapse.db`)
- **Backend:** `Bun.serve()` with REST routes + WebSocket
- **Frontend:** React 19 + Radix Themes, bundled via Bun HTML imports
- **Testing:** `bun:test`

## Project Structure

```
index.ts                  # Entry point — Bun.serve() with routes and WebSocket
src/
  db.ts                   # Schema, migrations, CRUD functions
  agents.ts               # Agent REST handlers
  threads.ts              # Thread REST handlers
  messages.ts             # Message REST handlers
  orchestration.ts        # LLM API calls (OpenAI, Anthropic), retry logic
  websocket.ts            # WebSocketManager — room-based messaging
  *.test.ts               # Co-located tests
public/
  index.html              # Entry HTML
  app.tsx                 # Root React component, state management
  api.ts                  # HTTP client wrapper
  useWebSocket.ts         # WebSocket hook with auto-reconnect
  styles.css              # Global styles (Radix theme variables)
  types.ts                # Shared types (Thread, Message, Agent)
  components/
    ThreadList.tsx         # Sidebar thread list
    ThreadView.tsx         # Chat interface
    AgentManager.tsx       # Agent CRUD panel
    ErrorBoundary.tsx      # Error boundary
```

## Database Schema

Four tables: `threads`, `agents`, `messages`, `thread_agents` (junction).

- Agents use **soft delete** (`is_active` flag) — never hard-delete agents
- `messages.agent_id` is nullable (SET NULL on agent delete)
- A trigger updates `threads.updated_at` on message insert
- Foreign keys are enabled (`PRAGMA foreign_keys = ON`)
- Agent names are unique among active agents only

## API

REST endpoints follow the pattern `/api/{resource}` and `/api/{resource}/:id`.

```
GET|POST       /api/threads
GET            /api/threads/:id
GET|PUT        /api/threads/:id/agents    # Bulk assign agents
GET|POST       /api/threads/:id/messages  # Supports ?limit=N&offset=N
GET|POST       /api/agents
GET|PUT|DELETE /api/agents/:id
```

Error responses: `{ error: "message" }` with appropriate status codes (400, 404, 409).

## WebSocket Protocol

Client sends `{ "type": "join", "threadId": N }` to join a thread room, then `{ "content": "text" }` to send messages. Server broadcasts: `message`, `typing`, `error`, `joined` events.

## Agent Orchestration

- All agents assigned to a thread respond concurrently to each user message
- Context window: system prompt + last 50 messages + new user message
- Supports OpenAI and Anthropic API formats
- `api_key_ref` stores an env var name, not the key itself
- Exponential backoff retry with Retry-After header support

## Scripts

- `bun run dev` — hot-reload development server (port 3000)
- `bun run start` — production server
- `bun test` — run all tests
- `bun run db:reset` — delete and recreate the database
- `bun run lint` — TypeScript type check (`tsc --noEmit`)

## Testing Conventions

- Tests live alongside source files in `src/*.test.ts`
- Database tests use `:memory:` SQLite for isolation
- API handler tests mock HTTP requests
- Orchestration tests mock `global.fetch`
- `beforeEach`/`afterEach` for setup and teardown

## Code Conventions

- British English spelling (e.g., `normaliseAgent`, `initialise`)
- Consistent error format: `{ error: "message" }`
- HTTP 201 for created resources, 400/404/409 for errors
- Functional style for DB operations, class for WebSocketManager
