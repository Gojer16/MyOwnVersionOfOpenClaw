// src/tui/components/overlays/model-picker.tsx
import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { fuzzySearch } from '../../utils/fuzzy.js';
import chalk from 'chalk';

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  supportsReasoning?: boolean;
}

export interface ModelPickerProps {
  models: Model[];
  currentModel?: string;
  onSelect: (model: Model) => void;
  onCancel: () => void;
}

export function ModelPicker({
  models,
  currentModel,
  onSelect,
  onCancel,
}: ModelPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return models;
    }

    const results = fuzzySearch(models, searchQuery, {
      keys: ['name', 'provider', 'id'],
      limit: 20,
    });

    return results.map(r => r.item);
  }, [models, searchQuery]);

  const items = filteredModels.map(model => ({
    label: formatModelLabel(model, currentModel === model.id),
    value: model.id,
  }));

  return (
    <Box 
      flexDirection="column" 
      borderStyle="double" 
      borderColor="yellow"
      padding={2}
      width={80}
    >
      <Box marginBottom={1}>
        <Text bold color="yellow">🎯 Select Model</Text>
        <Text dimColor> (Esc to cancel)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Search: </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type to filter..."
        />
      </Box>

      <Box flexDirection="column" height={15}>
        {items.length === 0 ? (
          <Text dimColor>No models found</Text>
        ) : (
          <SelectInput
            items={items}
            onSelect={(item) => {
              const model = models.find(m => m.id === item.value);
              if (model) onSelect(model);
            }}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {filteredModels.length} of {models.length} models
        </Text>
      </Box>
    </Box>
  );
}

function formatModelLabel(model: Model, isCurrent: boolean): string {
  const prefix = isCurrent ? '● ' : '○ ';
  const name = chalk.cyan(model.name);
  const provider = chalk.dim(`(${model.provider})`);
  const context = model.contextWindow 
    ? chalk.dim(` • ${(model.contextWindow / 1000).toFixed(0)}k`)
    : '';
  const reasoning = model.supportsReasoning 
    ? chalk.yellow(' • 🧠')
    : '';

  return `${prefix}${name} ${provider}${context}${reasoning}`;
}
