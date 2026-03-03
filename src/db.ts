import { Database, type SQLQueryBindings } from "bun:sqlite";

// Types
export type ResponseMode = "concurrent" | "random" | "ordered";

export interface Thread {
  id: number;
  title: string;
  response_mode: ResponseMode;
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

// Database initialisation
export function initDb(db: Database): void {
  // Enable foreign keys
  db.exec("PRAGMA foreign_keys = ON");

  // Create threads table
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      response_mode TEXT NOT NULL DEFAULT 'concurrent' CHECK (response_mode IN ('concurrent', 'random', 'ordered')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_emoji TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'openrouter')),
      model TEXT NOT NULL,
      api_key_ref TEXT NOT NULL,
      temperature REAL DEFAULT 0.7,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
      agent_id INTEGER,
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('complete', 'error')) DEFAULT 'complete',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
    )
  `);

  // Create thread_agents junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_agents (
      thread_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (thread_id, agent_id),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);

  // Create trigger to update threads.updated_at when a message is added
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_thread_timestamp
    AFTER INSERT ON messages
    BEGIN
      UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.thread_id;
    END
  `);

  // Migration: add 'openrouter' to agents provider CHECK constraint
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'").get() as { sql: string } | undefined;
  if (tableInfo && !tableInfo.sql.includes("openrouter")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(`
      CREATE TABLE agents_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        avatar_emoji TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'openrouter')),
        model TEXT NOT NULL,
        api_key_ref TEXT NOT NULL,
        temperature REAL DEFAULT 0.7,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec("INSERT INTO agents_new SELECT * FROM agents");
    db.exec("DROP TABLE agents");
    db.exec("ALTER TABLE agents_new RENAME TO agents");
    db.exec("PRAGMA foreign_keys = ON");
  }

  // Migration: add response_mode to threads
  const threadInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='threads'").get() as { sql: string } | undefined;
  if (threadInfo && !threadInfo.sql.includes("response_mode")) {
    db.exec("ALTER TABLE threads ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'concurrent' CHECK (response_mode IN ('concurrent', 'random', 'ordered'))");
  }

  // Migration: add position to thread_agents
  const taInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='thread_agents'").get() as { sql: string } | undefined;
  if (taInfo && !taInfo.sql.includes("position")) {
    db.exec("ALTER TABLE thread_agents ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
  }

  // Indexes for common queries
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_thread_agents_thread_id ON thread_agents(thread_id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_active_agent_name ON agents(name) WHERE is_active = TRUE");
}

// Helper to convert SQLite integer booleans to JS booleans
function normaliseAgent(agent: Agent): Agent {
  return {
    ...agent,
    is_active: Boolean(agent.is_active),
  };
}

// Thread operations
export function createThread(db: Database, title: string, responseMode: ResponseMode = "concurrent"): Thread {
  const stmt = db.prepare(
    "INSERT INTO threads (title, response_mode) VALUES (?, ?) RETURNING *"
  );
  return stmt.get(title, responseMode) as Thread;
}

export function updateThread(
  db: Database,
  id: number,
  updates: { response_mode?: ResponseMode }
): Thread | null {
  const existing = getThread(db, id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.response_mode !== undefined) {
    fields.push("response_mode = ?");
    values.push(updates.response_mode);
  }

  if (fields.length === 0) return existing;

  const stmt = db.prepare(
    `UPDATE threads SET ${fields.join(", ")} WHERE id = ? RETURNING *`
  );
  values.push(id);
  return stmt.get(...values as SQLQueryBindings[]) as Thread | null;
}

export function getThread(db: Database, id: number): Thread | null {
  const stmt = db.prepare("SELECT * FROM threads WHERE id = ?");
  const result = stmt.get(id) as Thread | undefined;
  return result ?? null;
}

export function listThreads(db: Database): Thread[] {
  const stmt = db.prepare("SELECT * FROM threads ORDER BY updated_at DESC, id DESC");
  return stmt.all() as Thread[];
}

// Message operations
export function createMessage(
  db: Database,
  threadId: number,
  role: "user" | "agent",
  agentId: number | null,
  content: string,
  status: "complete" | "error" = "complete"
): Message {
  const insertStmt = db.prepare(
    "INSERT INTO messages (thread_id, role, agent_id, content, status) VALUES (?, ?, ?, ?, ?) RETURNING id"
  );
  const { id } = insertStmt.get(threadId, role, agentId, content, status) as { id: number };

  const selectStmt = db.prepare(
    `SELECT m.*, a.name AS agent_name, a.avatar_emoji AS agent_avatar_emoji
     FROM messages m
     LEFT JOIN agents a ON m.agent_id = a.id
     WHERE m.id = ?`
  );
  return selectStmt.get(id) as Message;
}

export function getMessages(
  db: Database,
  threadId: number,
  options?: { limit?: number; offset?: number }
): Message[] {
  let sql = `SELECT m.*, a.name AS agent_name, a.avatar_emoji AS agent_avatar_emoji
    FROM messages m
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC`;
  const params: unknown[] = [threadId];

  if (options?.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  if (options?.offset !== undefined) {
    if (options.limit === undefined) {
      sql += " LIMIT -1";
    }
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  const stmt = db.prepare(sql);
  return stmt.all(...params as SQLQueryBindings[]) as Message[];
}

// Agent operations
export function createAgent(
  db: Database,
  input: CreateAgentInput
): Agent {
  const stmt = db.prepare(
    `INSERT INTO agents (name, avatar_emoji, system_prompt, provider, model, api_key_ref, temperature)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  );
  const result = stmt.get(
    input.name,
    input.avatar_emoji,
    input.system_prompt,
    input.provider,
    input.model,
    input.api_key_ref,
    input.temperature ?? 0.7
  ) as Agent;
  return normaliseAgent(result);
}

export function getAgent(db: Database, id: number): Agent | null {
  const stmt = db.prepare("SELECT * FROM agents WHERE id = ?");
  const result = stmt.get(id) as Agent | undefined;
  return result ? normaliseAgent(result) : null;
}

export function listAgents(db: Database): Agent[] {
  const stmt = db.prepare("SELECT * FROM agents ORDER BY created_at DESC, id DESC");
  return (stmt.all() as Agent[]).map(normaliseAgent);
}

export function updateAgent(
  db: Database,
  id: number,
  updates: Partial<Omit<CreateAgentInput, "temperature"> & { temperature: number; is_active: boolean }>
): Agent | null {
  const existing = getAgent(db, id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.avatar_emoji !== undefined) {
    fields.push("avatar_emoji = ?");
    values.push(updates.avatar_emoji);
  }
  if (updates.system_prompt !== undefined) {
    fields.push("system_prompt = ?");
    values.push(updates.system_prompt);
  }
  if (updates.provider !== undefined) {
    fields.push("provider = ?");
    values.push(updates.provider);
  }
  if (updates.model !== undefined) {
    fields.push("model = ?");
    values.push(updates.model);
  }
  if (updates.api_key_ref !== undefined) {
    fields.push("api_key_ref = ?");
    values.push(updates.api_key_ref);
  }
  if (updates.temperature !== undefined) {
    fields.push("temperature = ?");
    values.push(updates.temperature);
  }
  if (updates.is_active !== undefined) {
    fields.push("is_active = ?");
    values.push(updates.is_active);
  }

  if (fields.length === 0) return existing;

  const stmt = db.prepare(
    `UPDATE agents SET ${fields.join(", ")} WHERE id = ? RETURNING *`
  );
  values.push(id);
  const result = stmt.get(...values as SQLQueryBindings[]) as Agent | undefined;
  return result ? normaliseAgent(result) : null;
}

export function deleteAgent(db: Database, id: number): boolean {
  const stmt = db.prepare(
    "UPDATE agents SET is_active = FALSE WHERE id = ?"
  );
  const result = stmt.run(id);
  return result.changes > 0;
}

// Thread-agent junction operations
export function addAgentToThread(
  db: Database,
  threadId: number,
  agentId: number
): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO thread_agents (thread_id, agent_id) VALUES (?, ?)"
  );
  stmt.run(threadId, agentId);
}

export function removeAllAgentsFromThread(db: Database, threadId: number): void {
  db.prepare("DELETE FROM thread_agents WHERE thread_id = ?").run(threadId);
}

export function setAgentsForThread(db: Database, threadId: number, agentIds: number[]): void {
  removeAllAgentsFromThread(db, threadId);
  const stmt = db.prepare("INSERT INTO thread_agents (thread_id, agent_id, position) VALUES (?, ?, ?)");
  for (let i = 0; i < agentIds.length; i++) {
    stmt.run(threadId, agentIds[i]!, i);
  }
}

export function getAgentsForThread(db: Database, threadId: number): Agent[] {
  const stmt = db.prepare(`
    SELECT a.* FROM agents a
    JOIN thread_agents ta ON a.id = ta.agent_id
    WHERE ta.thread_id = ? AND a.is_active = TRUE
    ORDER BY ta.position ASC
  `);
  return stmt.all(threadId) as Agent[];
}
