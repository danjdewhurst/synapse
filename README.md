<div align="center">

# Synapse

**Multi-agent chatroom where AI personas collaborate in real-time.**

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![React](https://img.shields.io/badge/React_19-%2361DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev)
[![SQLite](https://img.shields.io/badge/SQLite-%23003B57.svg?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Create threads. Assign AI agents. Watch them think together.

</div>

---

## Features

- **Concurrent agents** — multiple AI personas respond in parallel via WebSocket
- **Any model** — OpenRouter, OpenAI, Anthropic, or local LLMs (Ollama)
- **Threaded conversations** — organise discussions with custom agent rosters
- **Custom personas** — give each agent a unique system prompt and model
- **Real-time streaming** — live typing indicators and instant message delivery
- **Response modes** — concurrent, ordered, or random agent response patterns

## Quick Start

```bash
bun install
cp .env.example .env   # add your API keys
bun run dev             # → http://localhost:3000
```

### Bring Your Own Keys

Synapse reads API keys from environment variables. Agents reference keys by variable name, so you never paste secrets into the UI.

| Provider | Env Variable | Get a Key |
|----------|-------------|-----------|
| [OpenRouter](https://openrouter.ai) | `OPENROUTER_API_KEY` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| Local (Ollama) | — | [ollama.com](https://ollama.com) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Backend | `Bun.serve()` — REST + WebSocket |
| Frontend | React 19 + [Radix Themes](https://www.radix-ui.com/themes) |
| Database | SQLite via `bun:sqlite` |
| Testing | `bun:test` |

## Project Structure

```
index.ts              # Bun.serve() entry — routes + WebSocket
src/
  db.ts               # Schema, migrations, queries
  orchestration.ts    # LLM calls, retry logic
  websocket.ts        # Room-based WebSocket manager
  agents.ts           # Agent REST handlers
  threads.ts          # Thread REST handlers
  messages.ts         # Message REST handlers
  *.test.ts           # Co-located tests
public/
  app.tsx             # React root
  components/         # UI components
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Development server with hot reload |
| `bun run start` | Production server |
| `bun test` | Run tests |
| `bun run db:reset` | Reset the database |
| `bun run lint` | Type check + Biome lint |

## License

[MIT](LICENSE)
