// src/tui/hooks/use-session.ts
import { useState, useCallback } from 'react';

export interface SessionInfo {
  sessionId: string | null;
  agentId: string;
  model: string;
  provider: string;
  thinkingLevel: string;
  verboseLevel: string;
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UseSessionReturn {
  session: SessionInfo;
  updateSession: (updates: Partial<SessionInfo>) => void;
  resetSession: () => void;
}

const defaultSession: SessionInfo = {
  sessionId: null,
  agentId: 'default',
  model: 'unknown',
  provider: 'unknown',
  thinkingLevel: 'off',
  verboseLevel: 'off',
  contextTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function useSession(initial?: Partial<SessionInfo>): UseSessionReturn {
  const [session, setSession] = useState<SessionInfo>({
    ...defaultSession,
    ...initial,
  });

  const updateSession = useCallback((updates: Partial<SessionInfo>) => {
    setSession((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetSession = useCallback(() => {
    setSession(defaultSession);
  }, []);

  return {
    session,
    updateSession,
    resetSession,
  };
}
