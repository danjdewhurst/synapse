import { Box, Button, Card, Flex, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import * as api from "../api";
import type { Agent, CreateAgentInput, PresetAgent } from "../types";

interface AgentManagerProps {
  agents: Agent[];
  onAgentsUpdate: (agents: Agent[]) => void;
}

const API_KEY_REF_FOR_PROVIDER: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

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
  const [presets, setPresets] = useState<PresetAgent[]>([]);
  const [addingPreset, setAddingPreset] = useState<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load on mount
  useEffect(() => {
    loadAgents();
    loadPresets();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await api.listAgents();
      onAgentsUpdate(data);
    } catch (error) {
      console.error("Failed to load agents:", error);
    }
  };

  const loadPresets = async () => {
    try {
      const data = await api.listPresets();
      setPresets(data);
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
  };

  const handleAddPreset = async (index: number) => {
    setAddingPreset(index);
    try {
      await api.createFromPreset(index);
      await loadAgents();
    } catch (error) {
      console.error("Failed to add preset:", error);
    } finally {
      setAddingPreset(null);
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
      <Text size="5" weight="bold" mb="3" as="p">
        🤖 Agents
      </Text>

      <Flex direction="column" gap="3" mb="4">
        {activeAgents.length === 0 ? (
          <Text color="gray">No agents configured yet.</Text>
        ) : (
          activeAgents.map((agent) => (
            <Card key={agent.id}>
              <Flex justify="between" align="center" mb="1">
                <Text weight="medium" size="3">
                  {agent.name}
                </Text>
                <Text size="5">{agent.avatar_emoji}</Text>
              </Flex>
              <Text size="1" color="gray" mb="2" as="p">
                {agent.provider} / {agent.model} &bull; temp: {agent.temperature}
              </Text>
              <Flex gap="2">
                <Button variant="outline" size="1" onClick={() => handleEdit(agent)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  size="1"
                  onClick={() => handleDelete(agent.id)}
                >
                  Delete
                </Button>
              </Flex>
            </Card>
          ))
        )}
      </Flex>

      {presets.length > 0 &&
        (() => {
          const activeNames = new Set(activeAgents.map((a) => a.name));
          const available = presets
            .map((p, i) => ({ ...p, index: i }))
            .filter((p) => !activeNames.has(p.name));
          if (available.length === 0) return null;
          return (
            <Box mb="4">
              <Text size="3" weight="bold" mb="2" as="p">
                Add from Presets
              </Text>
              <Flex gap="2" wrap="wrap">
                {available.map((preset) => (
                  <Card key={preset.index} style={{ flex: "1 1 calc(50% - 4px)", minWidth: 160 }}>
                    <Flex justify="between" align="start" gap="2">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text weight="medium" size="2">
                          {preset.avatar_emoji} {preset.name}
                        </Text>
                        <Text size="1" color="gray" as="p" style={{ marginTop: 2 }}>
                          {preset.system_prompt.slice(0, 80)}...
                        </Text>
                      </Box>
                      <Button
                        size="1"
                        variant="soft"
                        disabled={addingPreset === preset.index}
                        onClick={() => handleAddPreset(preset.index)}
                      >
                        {addingPreset === preset.index ? "Adding..." : "Add"}
                      </Button>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            </Box>
          );
        })()}

      <Card>
        <Text size="3" weight="bold" mb="3" as="p">
          {isEditing ? "Edit Agent" : "Create Agent"}
        </Text>

        <Flex direction="column" gap="3" mb="3">
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">
              Name
            </Text>
            <TextField.Root
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Agent name"
            />
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">
              Emoji
            </Text>
            <TextField.Root
              value={formData.avatar_emoji}
              onChange={(e) => setFormData({ ...formData, avatar_emoji: e.target.value })}
              placeholder="🤖"
            />
          </Box>
        </Flex>

        <Box mb="3">
          <Text as="label" size="2" weight="medium" mb="1">
            System Prompt
          </Text>
          <TextArea
            value={formData.system_prompt}
            onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
            placeholder="You are a helpful assistant..."
            style={{ minHeight: 100 }}
          />
        </Box>

        <Flex direction="column" gap="3" mb="3">
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">
              Provider
            </Text>
            <Select.Root
              value={formData.provider}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  provider: value as "openai" | "anthropic" | "openrouter",
                  api_key_ref: API_KEY_REF_FOR_PROVIDER[value] ?? value,
                })
              }
            >
              <Select.Trigger style={{ width: "100%" }} />
              <Select.Content>
                <Select.Item value="openai">OpenAI</Select.Item>
                <Select.Item value="anthropic">Anthropic</Select.Item>
                <Select.Item value="openrouter">OpenRouter</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">
              Model
            </Text>
            <TextField.Root
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="gpt-4o"
            />
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">
              Temperature
            </Text>
            <TextField.Root
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={String(formData.temperature)}
              onChange={(e) =>
                setFormData({ ...formData, temperature: parseFloat(e.target.value) })
              }
            />
          </Box>
        </Flex>

        <Flex gap="2" justify="end">
          {isEditing && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving || !formData.name.trim()}>
            {isSaving ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </Flex>
      </Card>
    </div>
  );
}
