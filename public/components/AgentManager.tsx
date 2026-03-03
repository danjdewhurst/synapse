import { useState, useEffect } from "react";
import type { Agent, CreateAgentInput } from "../types";
import * as api from "../api";

interface AgentManagerProps {
  agents: Agent[];
  onAgentsUpdate: (agents: Agent[]) => void;
}

const emptyAgent: CreateAgentInput = {
  name: "",
  avatar_emoji: "🤖",
  system_prompt: "",
  provider: "openai",
  model: "gpt-4o",
  api_key_ref: "OPENAI_API_KEY",
  temperature: 0.7,
};

export function AgentManager({ agents, onAgentsUpdate }: AgentManagerProps) {
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [formData, setFormData] = useState<CreateAgentInput>(emptyAgent);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await api.listAgents();
      onAgentsUpdate(data);
    } catch (error) {
      console.error("Failed to load agents:", error);
    }
  };

  const handleEdit = (agent: Agent) => {
    setIsEditing(agent.id);
    setFormData({
      name: agent.name,
      avatar_emoji: agent.avatar_emoji,
      system_prompt: agent.system_prompt,
      provider: agent.provider,
      model: agent.model,
      api_key_ref: agent.api_key_ref,
      temperature: agent.temperature,
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.system_prompt.trim()) return;

    setIsSaving(true);
    try {
      if (isEditing) {
        await api.updateAgent(isEditing, formData);
      } else {
        await api.createAgent(formData);
      }
      await loadAgents();
      setIsEditing(null);
      setFormData(emptyAgent);
    } catch (error) {
      console.error("Failed to save agent:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this agent?")) return;

    try {
      await api.deleteAgent(id);
      await loadAgents();
    } catch (error) {
      console.error("Failed to delete agent:", error);
    }
  };

  const handleCancel = () => {
    setIsEditing(null);
    setFormData(emptyAgent);
  };

  const activeAgents = agents.filter((a) => a.is_active);

  return (
    <div className="agent-manager">
      <h2>🤖 Agents</h2>

      <div className="agent-list">
        {activeAgents.length === 0 ? (
          <p>No agents configured yet.</p>
        ) : (
          activeAgents.map((agent) => (
            <div key={agent.id} className="agent-card">
              <div className="agent-card-header">
                <span className="agent-card-name">{agent.name}</span>
                <span className="agent-card-emoji">{agent.avatar_emoji}</span>
              </div>
              <div className="agent-card-meta">
                {agent.provider} / {agent.model} • temp: {agent.temperature}
              </div>
              <div className="agent-card-actions">
                <button
                  className="outline"
                  onClick={() => handleEdit(agent)}
                >
                  Edit
                </button>
                <button
                  className="outline secondary"
                  onClick={() => handleDelete(agent.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="agent-form">
        <h3>{isEditing ? "Edit Agent" : "Create Agent"}</h3>

        <div className="grid">
          <div>
            <label>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Agent name"
            />
          </div>
          <div>
            <label>Emoji</label>
            <input
              type="text"
              value={formData.avatar_emoji}
              onChange={(e) =>
                setFormData({ ...formData, avatar_emoji: e.target.value })
              }
              placeholder="🤖"
            />
          </div>
        </div>

        <label>System Prompt</label>
        <textarea
          value={formData.system_prompt}
          onChange={(e) =>
            setFormData({ ...formData, system_prompt: e.target.value })
          }
          placeholder="You are a helpful assistant..."
        />

        <div className="grid">
          <div>
            <label>Provider</label>
            <select
              value={formData.provider}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  provider: e.target.value as "openai" | "anthropic",
                })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label>Model</label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) =>
                setFormData({ ...formData, model: e.target.value })
              }
              placeholder="gpt-4o"
            />
          </div>
        </div>

        <div className="grid">
          <div>
            <label>API Key Environment Variable</label>
            <input
              type="text"
              value={formData.api_key_ref}
              onChange={(e) =>
                setFormData({ ...formData, api_key_ref: e.target.value })
              }
              placeholder="OPENAI_API_KEY"
            />
          </div>
          <div>
            <label>Temperature</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={formData.temperature}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  temperature: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>

        <div className="agent-form-actions">
          {isEditing && (
            <button className="outline" onClick={handleCancel}>
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !formData.name.trim()}
          >
            {isSaving ? "Saving..." : isEditing ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
