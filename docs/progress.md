# Synapse MVP Progress

Tracking implementation progress for the multi-agent chatroom.

## Task Overview

| # | Task | Status | Test File |
|---|------|--------|-----------|
| 1 | Progress tracking | ✅ Complete | - |
| 2 | Database schema | ✅ Complete | src/db.test.ts |
| 3 | Thread API endpoints | ✅ Complete | src/threads.test.ts |
| 4 | Thread messages API | ✅ Complete | src/messages.test.ts |
| 5 | Agent CRUD API | ✅ Complete | src/agents.test.ts |
| 6 | Agent orchestration | ✅ Complete | src/orchestration.test.ts |
| 7 | WebSocket server | ✅ Complete | src/websocket.test.ts |
| 8 | Frontend HTML entry | ✅ Complete | - |
| 9 | React App shell | ✅ Complete | - |
| 10 | ThreadList component | ✅ Complete | - |
| 11 | ThreadView component | ✅ Complete | - |
| 12 | AgentManager component | ✅ Complete | - |
| 13 | WebSocket client | ✅ Complete | - |
| 14 | Typing indicators & markdown | ✅ Complete | - |

## Success Criteria

- [x] Create thread, see it in sidebar
- [x] Send message, see it appear
- [x] Configure agent with model/provider/prompt
- [x] Agent responds automatically in thread
- [x] Multiple agents can respond to same message
- [x] All messages persist on refresh

## Notes

- Using TDD: Red → Green → Refactor
- Bun SQLite for database
- Bun.serve() for HTTP + WebSocket
- HTML imports for frontend (no build step)

## Running the Application

```bash
# Set API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Run the server
bun --hot index.ts

# Open http://localhost:3000
```
