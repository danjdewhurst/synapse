import { useState, useEffect } from "react";
import { Button, TextField, TextArea, Select, Card, Flex, Grid, Text, Box } from "@radix-ui/themes";
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
      <Text size="5" weight="bold" mb="3" as="p">🤖 Agents</Text>

      <Flex direction="column" gap="3" mb="4">
        {activeAgents.length === 0 ? (
          <Text color="gray">No agents configured yet.</Text>
        ) : (
          activeAgents.map((agent) => (
            <Card key={agent.id}>
              <Flex justify="between" align="center" mb="1">
                <Text weight="medium" size="3">{agent.name}</Text>
                <Text size="5">{agent.avatar_emoji}</Text>
              </Flex>
              <Text size="1" color="gray" mb="2" as="p">
                {agent.provider} / {agent.model} &bull; temp: {agent.temperature}
              </Text>
              <Flex gap="2">
                <Button variant="outline" size="1" onClick={() => handleEdit(agent)}>
                  Edit
                </Button>
                <Button variant="outline" color="red" size="1" onClick={() => handleDelete(agent.id)}>
                  Delete
                </Button>
              </Flex>
            </Card>
          ))
        )}
      </Flex>

      <Card>
        <Text size="3" weight="bold" mb="3" as="p">
          {isEditing ? "Edit Agent" : "Create Agent"}
        </Text>

        <Grid columns="2" gap="3" mb="3">
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">Name</Text>
            <TextField.Root
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Agent name"
            />
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">Emoji</Text>
            <TextField.Root
              value={formData.avatar_emoji}
              onChange={(e) => setFormData({ ...formData, avatar_emoji: e.target.value })}
              placeholder="🤖"
            />
          </Box>
        </Grid>

        <Box mb="3">
          <Text as="label" size="2" weight="medium" mb="1">System Prompt</Text>
          <TextArea
            value={formData.system_prompt}
            onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
            placeholder="You are a helpful assistant..."
            style={{ minHeight: 100 }}
          />
        </Box>

        <Grid columns="2" gap="3" mb="3">
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">Provider</Text>
            <Select.Root
              value={formData.provider}
              onValueChange={(value) =>
                setFormData({ ...formData, provider: value as "openai" | "anthropic" })
              }
            >
              <Select.Trigger style={{ width: "100%" }} />
              <Select.Content>
                <Select.Item value="openai">OpenAI</Select.Item>
                <Select.Item value="anthropic">Anthropic</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">Model</Text>
            <TextField.Root
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="gpt-4o"
            />
          </Box>
        </Grid>

        <Grid columns="2" gap="3" mb="3">
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">API Key Env Var</Text>
            <TextField.Root
              value={formData.api_key_ref}
              onChange={(e) => setFormData({ ...formData, api_key_ref: e.target.value })}
              placeholder="OPENAI_API_KEY"
            />
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">Temperature</Text>
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
        </Grid>

        <Flex gap="2" justify="end">
          {isEditing && (
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || !formData.name.trim()}
          >
            {isSaving ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </Flex>
      </Card>
    </div>
  );
}
