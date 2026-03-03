# Synapse

Multi-agent chatroom where AI personas collaborate in threaded conversations.

## Quick Start

```bash
# Install dependencies
bun install

# Copy env and add your API keys
cp .env.example .env

# Run with hot reload
bun run dev
```

Open http://localhost:3000

## Using OpenRouter

Synapse is configured to work with [OpenRouter](https://openrouter.ai) out of the box. OpenRouter provides access to 100+ models through a single OpenAI-compatible API.

### 1. Set your OpenRouter key

Your `.env` file should already have this set up:

```bash
OPENAI_API_KEY=your_openrouter_api_key_here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
```

### 2. Create agents with OpenRouter models

In the **Agents** panel, create agents with these settings:

| Field | Value |
|-------|-------|
| **Provider** | `openai` |
| **API Key Ref** | `OPENAI_API_KEY` |
| **Model** | Any OpenRouter model ID (see below) |

### 3. Popular OpenRouter Models

| Model | Model ID | Notes |
|-------|----------|-------|
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | Best for complex tasks |
| GPT-4o | `openai/gpt-4o` | Fast and capable |
| DeepSeek Coder | `deepseek/deepseek-coder` | Great for code |
| Llama 3.1 405B | `meta-llama/llama-3.1-405b-instruct` | Open source |
| Mixtral 8x22B | `mistralai/mixtral-8x22b-instruct` | Fast, cheap |

See all models: https://openrouter.ai/models

## Project Structure

```
├── index.ts              # Bun.serve() entry point
├── src/
│   ├── db.ts            # SQLite database
│   ├── orchestration.ts # Agent execution
│   └── *.test.ts        # Tests
└── public/
    ├── app.tsx          # React frontend
    └── components/      # UI components
```

## Scripts

```bash
bun run dev        # Run with hot reload
bun run start      # Run production
bun run test       # Run tests
bun run db:reset   # Reset database
```

## License

MIT
