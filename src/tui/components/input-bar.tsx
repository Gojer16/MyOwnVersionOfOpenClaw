// src/tui/components/input-bar.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export interface InputBarProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function InputBar({ 
  onSubmit, 
  placeholder = 'Type a message...',
  disabled = false,
}: InputBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <Box marginTop={1}>
      <Text color="cyan" bold>You &gt; </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={!disabled}
      />
    </Box>
  );
}
