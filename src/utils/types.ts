// ─── Shared TypeScript Types ──────────────────────────────────────
// Canonical message types matching 02-COMPONENTS.md interfaces

import { type WebSocket } from 'ws';

// ─── WebSocket Protocol ───────────────────────────────────────────

// Client → Server events
export type ClientEventType =
    | 'gateway.status'
    | 'session.list'
    | 'session.create'
    | 'session.send_message'
    | 'session.reset'
    | 'tools.list'
    | 'tools.invoke'
    | 'channel.message'; // Legacy support

// Server → Client events
export type ServerEventType =
    | 'gateway.status'
    | 'session.created'
    | 'session.list'
    | 'session.message.delta'
    | 'session.message.final'
    | 'session.reset'
    | 'tools.list'
    | 'tools.result'
    | 'session.error'
    | 'agent.response'
    | 'agent.response.end'
    | 'tool.call'
    | 'tool.result'
    | 'tool.stream'
    | 'shadow.ghost'
    | 'session.resumed'
    | 'config.updated'
    | 'error';

export type MessageType = ClientEventType | ServerEventType;

export interface WSMessage {
    id: string;
    type: MessageType;
    timestamp: number;
    payload: unknown;
}

// ─── WebSocket Event Payloads ─────────────────────────────────────

// Client → Server
export interface GatewayStatusRequest {}

export interface SessionListRequest {}

export interface SessionCreateRequest {
    senderId: string;
    channel: string;
    senderName?: string;
}

export interface SessionSendMessageRequest {
    sessionId: string;
    text: string;
    senderName?: string;
}

export interface SessionResetRequest {
    sessionId: string;
}

export interface ToolsListRequest {}

export interface ToolsInvokeRequest {
    toolName: string;
    args: Record<string, unknown>;
}

// Server → Client
export interface GatewayStatusResponse {
    status: 'ok' | 'degraded';
    version: string;
    uptime: number;
    timestamp: string;
    components: {
        gateway: 'ok' | 'error';
        sessions: 'ok' | 'error';
        agent: 'ok' | 'disabled' | 'error';
        websocket: 'ok' | 'error';
    };
    stats: {
        sessions: number;
        activeSessions: number;
        wsClients: number;
        totalMessages: number;
    };
}

export interface SessionCreatedResponse {
    sessionId: string;
    senderId: string;
    channel: string;
    createdAt: number;
}

export interface SessionListResponse {
    sessions: Array<{
        id: string;
        senderId: string;
        channel: string;
        state: 'created' | 'active' | 'idle';
        messageCount: number;
        createdAt: number;
        lastActiveAt: number;
    }>;
}

export interface SessionMessageDelta {
    sessionId: string;
    delta: string;
    index: number;
}

export interface SessionMessageFinal {
    sessionId: string;
    message: {
        role: 'assistant';
        content: string;
        timestamp: number;
    };
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model?: string;
}

export interface SessionResetResponse {
    sessionId: string;
    success: boolean;
}

export interface ToolsListResponse {
    tools: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
}

export interface ToolsResultResponse {
    toolName: string;
    success: boolean;
    output: string;
    error?: string;
}

export interface SessionErrorResponse {
    error: string;
    code?: string;
    sessionId?: string;
}

// ─── Messages ─────────────────────────────────────────────────────

export interface InboundMessage {
    channel: string;
    senderId: string;
    senderName: string;
    text: string;
    media: MediaAttachment | null;
    isGroup: boolean;
    groupId: string | null;
}

export interface MediaAttachment {
    type: 'image' | 'audio' | 'video' | 'document';
    url: string;
    mimeType: string;
    size?: number;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface OutboundMessage {
    sessionId: string;
    text: string;
    media?: MediaAttachment | null;
    replyTo?: string;
    metadata?: {
        usage?: TokenUsage;
        provider?: string;
        model?: string;
        error?: boolean;
        errorDetails?: string;
    };
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    timestamp: number;
    channel?: string;
}

// ─── Tools ────────────────────────────────────────────────────────

export interface ToolCall {
    id: string;
    tool: string;
    args: Record<string, unknown>;
}

export interface ToolResult {
    success: boolean;
    output: string;
    metadata?: {
        executionTime: number;
        truncated?: boolean;
        confirmation?: string;
    };
}

// ─── Sessions ─────────────────────────────────────────────────────

export type SessionState = 'created' | 'active' | 'idle';

export interface Session {
    id: string;
    senderId: string;
    channel: string;
    state: SessionState;
    messages: Message[];
    memorySummary: string;
    metadata: {
        createdAt: number;
        lastActiveAt: number;
        messageCount: number;
        model: string;
    };
    config: {
        model?: string;
        thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
        verboseLevel?: boolean;
    };
    scratchpad?: {
        visited?: string[];
        collected?: any[];
        pending?: string[];
        progress?: Record<string, any>;
    };
}

// ─── Channel ──────────────────────────────────────────────────────

export interface Channel {
    name: string;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(sessionId: string, message: OutboundMessage): Promise<void>;
    onMessage(handler: (msg: InboundMessage) => void): void;
}

// ─── Event Bus Types ──────────────────────────────────────────────

export interface EventMap {
    // Core message events
    'message.inbound': { message: InboundMessage; sessionId: string };
    'message.outbound': { message: OutboundMessage; sessionId: string };
    
    // Tool events
    'tool.execute': { sessionId: string; tool: string; args: Record<string, unknown> };
    'tool.complete': { sessionId: string; tool: string; result: ToolResult };
    'tool.started': { sessionId: string; toolId: string; toolName: string; args: Record<string, unknown> };
    'tool.failed': { sessionId: string; toolId: string; toolName: string; error: string };
    
    // Session events
    'session.created': { session: Session };
    'session.idle': { sessionId: string };
    'session.resumed': { session: Session };
    'session.closed': { sessionId: string; reason: string };
    
    // Shadow loop events
    'shadow.event': { type: string; data: unknown };
    'shadow.ghost': { sessionId: string; message: string };
    
    // Configuration events
    'config.changed': { key: string; value: unknown };
    'config.reload': { path: string };
    'config.reloaded': { config: unknown };
    
    // Agent events
    'agent.thinking': { sessionId: string };
    'agent.model.used': { sessionId: string; provider: string; model: string; iteration?: number };
    'agent.run.started': { sessionId: string; runId: string };
    'agent.run.completed': { sessionId: string; runId: string; duration: number };
    'agent.run.failed': { sessionId: string; runId: string; error: string };
    
    // Protocol events
    'protocol.connected': { clientId: string; protocolVersion: string };
    'protocol.disconnected': { clientId: string; reason?: string };
    'protocol.error': { clientId: string; error: string; code?: string };
    
    // Plugin events
    'plugin.loaded': { pluginId: string; pluginName: string };
    'plugin.activated': { pluginId: string; pluginName: string };
    'plugin.deactivated': { pluginId: string; pluginName: string };
    'plugin.error': { pluginId: string; error: string };
    
    // Cron events
    'cron.job.added': { jobId: string; jobName: string; schedule: string };
    'cron.job.removed': { jobId: string; jobName: string };
    'cron.job.started': { jobId: string; runId: string };
    'cron.job.completed': { jobId: string; runId: string; duration: number };
    'cron.job.failed': { jobId: string; runId: string; error: string };
    
    // Channel events
    'channel.connected': { channelId: string; channelName: string };
    'channel.disconnected': { channelId: string; channelName: string; reason?: string };
    'channel.error': { channelId: string; error: string };
    
    // System events
    'system.startup': { version: string; timestamp: number };
    'system.shutdown': { signal: string; timestamp: number };
    'system.error': { component: string; error: string; stack?: string };
}

// ─── WebSocket Client Tracking ────────────────────────────────────

export interface WSClient {
    ws: WebSocket;
    id: string;
    connectedAt: number;
    sessionId?: string;
}
