// src/tui/hooks/use-gateway.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import WebSocket from 'ws';

export interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

export interface UseGatewayOptions {
  onMessage?: (message: GatewayMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
}

export interface UseGatewayReturn {
  isConnected: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (text: string) => Promise<void>;
  sendRaw: (data: unknown) => void;
}

export function useGateway(
  url: string,
  options: UseGatewayOptions = {}
): UseGatewayReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { onMessage, onConnect, onDisconnect, onError, autoConnect = false } = options;

  const connect = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.on('open', () => {
          setIsConnected(true);
          setError(null);
          onConnect?.();
          resolve();
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as GatewayMessage;
            onMessage?.(message);
          } catch (err) {
            const parseError = err instanceof Error ? err : new Error('Parse error');
            setError(parseError);
            onError?.(parseError);
          }
        });

        ws.on('error', (err) => {
          const wsError = err instanceof Error ? err : new Error('WebSocket error');
          setError(wsError);
          onError?.(wsError);
          reject(wsError);
        });

        ws.on('close', () => {
          setIsConnected(false);
          onDisconnect?.();
        });
      } catch (err) {
        const connectError = err instanceof Error ? err : new Error('Connection failed');
        setError(connectError);
        reject(connectError);
      }
    });
  }, [url, onMessage, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!wsRef.current || !isConnected) {
      throw new Error('Not connected to gateway');
    }

    const message = {
      type: 'chat.message',
      text,
      timestamp: Date.now(),
    };

    wsRef.current.send(JSON.stringify(message));
  }, [isConnected]);

  const sendRaw = useCallback((data: unknown) => {
    if (!wsRef.current || !isConnected) {
      throw new Error('Not connected to gateway');
    }

    wsRef.current.send(JSON.stringify(data));
  }, [isConnected]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    sendMessage,
    sendRaw,
  };
}
