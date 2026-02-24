// ─── Talon Gateway Server ─────────────────────────────────────────
// Fastify HTTP + WebSocket server

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TalonConfig } from '../config/schema.js';
import type { EventBus } from './events.js';
import type { SessionManager } from './sessions.js';
import type { MessageRouter } from './router.js';
import type { AgentLoop } from '../agent/loop.js';
import type { WSMessage, WSClient, InboundMessage } from '../utils/types.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TalonServer {
    private fastify = Fastify({ logger: false });
    private wss!: WebSocketServer;
    private clients = new Map<string, WSClient>();
    private outboundListenerBound = false;

    constructor(
        private config: TalonConfig,
        private eventBus: EventBus,
        private sessionManager: SessionManager,
        private router: MessageRouter,
        private agentLoop?: AgentLoop,
    ) { }

    // ─── Setup ──────────────────────────────────────────────────

    async setup(): Promise<void> {
        // Auth middleware
        if (this.config.gateway.auth.mode === 'token') {
            this.fastify.addHook('onRequest', async (request, reply) => {
                // Skip auth for health checks and static files
                if (request.url.startsWith('/api/health') || !request.url.startsWith('/api')) {
                    return;
                }

                const token = this.config.gateway.auth.token;
                if (!token) {
                    logger.warn('Token auth enabled but no token configured');
                    return;
                }

                const authHeader = request.headers.authorization;
                const providedToken = authHeader?.replace('Bearer ', '');

                if (providedToken !== token) {
                    reply.code(401).send({ error: 'Unauthorized' });
                    return;
                }
            });
        }

        // CORS
        await this.fastify.register(cors, {
            origin: this.config.gateway.cors.origins,
        });

        // Serve web UI: prefer built assets, otherwise serve a minimal fallback page.
        const builtWebDir = path.join(__dirname, '../../dist/web');
        const builtIndex = path.join(builtWebDir, 'index.html');
        if (fs.existsSync(builtIndex)) {
            await this.fastify.register(fastifyStatic, {
                root: builtWebDir,
                prefix: '/',
            });
            logger.info({ builtWebDir }, 'Serving built web UI');
        } else {
            this.fastify.get('/', async (_request, reply) => {
                reply.type('text/html; charset=utf-8');
                return this.getFallbackWebChatHtml();
            });
            logger.warn({ builtWebDir }, 'Built web UI not found, serving fallback WebChat page');
        }

        // HTTP routes
        this.registerRoutes();

        // Start HTTP server
        const address = await this.fastify.listen({
            host: this.config.gateway.host,
            port: this.config.gateway.port,
        });

        // Attach WebSocket server to Fastify's underlying HTTP server
        this.wss = new WebSocketServer({
            server: this.fastify.server,
            path: '/ws',
        });

        this.setupWebSocket();
        this.setupEventBridge();

        logger.info(`Talon Gateway listening on ${address}`);
        logger.info(`WebSocket available at ws://${this.config.gateway.host}:${this.config.gateway.port}/ws`);
    }

    private setupEventBridge(): void {
        if (this.outboundListenerBound) return;

        this.eventBus.on('message.outbound', ({ message, sessionId }) => {
            this.broadcastToSession(sessionId, {
                id: nanoid(),
                type: 'session.message.final',
                timestamp: Date.now(),
                payload: {
                    sessionId,
                    message: {
                        role: 'assistant',
                        content: message.text,
                        timestamp: Date.now(),
                    },
                    usage: message.metadata?.usage,
                    model: message.metadata?.model,
                },
            });
        });

        this.outboundListenerBound = true;
    }

    private getFallbackWebChatHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Talon WebChat</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; margin: 0; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .card { background: #fff; border: 1px solid #e4e7ec; border-radius: 12px; padding: 12px; min-height: 420px; max-height: 62vh; overflow: auto; }
    .msg { margin: 8px 0; padding: 8px 10px; border-radius: 10px; white-space: pre-wrap; }
    .user { background: #e8f1ff; margin-left: 18%; }
    .assistant { background: #eefbf0; margin-right: 18%; }
    .row { display: flex; gap: 8px; margin-top: 12px; }
    input { flex: 1; padding: 10px; border: 1px solid #d0d5dd; border-radius: 8px; }
    button { padding: 10px 14px; border: 0; border-radius: 8px; background: #0b65d8; color: #fff; }
    .muted { color: #667085; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h2 style="margin: 0;">Talon WebChat</h2>
      <div id="status" class="muted">Connecting...</div>
    </div>
    <div id="messages" class="card"></div>
    <form id="form" class="row">
      <input id="text" type="text" placeholder="Type a message..." />
      <button type="submit">Send</button>
    </form>
  </div>
  <script>
    const statusEl = document.getElementById('status');
    const messagesEl = document.getElementById('messages');
    const formEl = document.getElementById('form');
    const textEl = document.getElementById('text');
    let sessionId = null;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(wsProtocol + '//' + window.location.host + '/ws');

    function appendMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    ws.onopen = () => {
      statusEl.textContent = 'Connected';
      ws.send(JSON.stringify({
        id: Math.random().toString(36).slice(2),
        type: 'session.create',
        timestamp: Date.now(),
        payload: { senderId: 'web-user', channel: 'webchat', senderName: 'Web User' }
      }));
    };

    ws.onclose = () => { statusEl.textContent = 'Disconnected'; };
    ws.onerror = () => { statusEl.textContent = 'Connection error'; };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'session.created') {
        sessionId = msg.payload.sessionId;
      } else if (msg.type === 'session.message.final') {
        appendMessage('assistant', msg.payload.message.content || '');
      } else if (msg.type === 'agent.response') {
        appendMessage('assistant', msg.payload.content || '');
      } else if (msg.type === 'session.error' || msg.type === 'error') {
        appendMessage('assistant', 'Error: ' + (msg.payload?.error || 'Unknown error'));
      }
    };

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (textEl.value || '').trim();
      if (!text || !sessionId || ws.readyState !== WebSocket.OPEN) return;
      appendMessage('user', text);
      ws.send(JSON.stringify({
        id: Math.random().toString(36).slice(2),
        type: 'session.send_message',
        timestamp: Date.now(),
        payload: { sessionId, text, senderName: 'Web User' }
      }));
      textEl.value = '';
    });
  </script>
</body>
</html>`;
    }

    // ─── HTTP Routes ──────────────────────────────────────────────

    private registerRoutes(): void {
        // Health check - enhanced with component status
        this.fastify.get('/api/health', async () => {
            const sessions = this.sessionManager.getAllSessions();
            
            return {
                status: 'ok',
                version: '0.4.0',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                components: {
                    gateway: 'ok',
                    sessions: 'ok',
                    agent: this.agentLoop ? 'ok' : 'disabled',
                    websocket: 'ok',
                },
                stats: {
                    sessions: sessions.length,
                    activeSessions: sessions.filter(s => s.state === 'active').length,
                    wsClients: this.clients.size,
                    totalMessages: sessions.reduce((sum, s) => sum + s.metadata.messageCount, 0),
                },
            };
        });

        // Deep health check - probes each component
        this.fastify.get('/api/health/deep', async () => {
            const checks: Record<string, { ok: boolean; message?: string }> = {};
            
            // Check sessions
            try {
                const sessions = this.sessionManager.getAllSessions();
                checks.sessions = { ok: true, message: `${sessions.length} sessions` };
            } catch (err) {
                checks.sessions = { ok: false, message: String(err) };
            }
            
            // Check agent loop
            if (this.agentLoop) {
                checks.agent = { ok: true, message: 'Running' };
            } else {
                checks.agent = { ok: false, message: 'Not initialized' };
            }
            
            // Check memory
            try {
                checks.memory = { ok: true, message: 'OK' };
            } catch (err) {
                checks.memory = { ok: false, message: String(err) };
            }
            
            const allOk = Object.values(checks).every(c => c.ok);
            
            return {
                status: allOk ? 'ok' : 'degraded',
                timestamp: new Date().toISOString(),
                checks,
            };
        });

        // Ready check - for load balancers
        this.fastify.get('/api/ready', async () => {
            const hasAgent = !!this.agentLoop;
            if (!hasAgent) {
                return { ready: false, reason: 'Agent not initialized' };
            }
            return { ready: true };
        });

        // List sessions
        this.fastify.get('/api/sessions', async () => {
            const sessions = this.sessionManager.getAllSessions();
            return sessions.map(s => ({
                id: s.id,
                senderId: s.senderId,
                channel: s.channel,
                state: s.state,
                messageCount: s.metadata.messageCount,
                createdAt: s.metadata.createdAt,
                lastActiveAt: s.metadata.lastActiveAt,
            }));
        });

        // Get specific session
        this.fastify.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
            const session = this.sessionManager.getSession(request.params.id);
            if (!session) {
                reply.code(404);
                return { error: 'Session not found' };
            }
            return session;
        });

        // Send message to session (REST alternative to WebSocket)
        this.fastify.post<{
            Params: { id: string };
            Body: { text: string; senderName?: string };
        }>('/api/sessions/:id/send', async (request, reply) => {
            const session = this.sessionManager.getSession(request.params.id);
            if (!session) {
                reply.code(404);
                return { error: 'Session not found' };
            }

            const body = request.body as { text: string; senderName?: string };

            const message: InboundMessage = {
                channel: 'api',
                senderId: session.senderId,
                senderName: body.senderName ?? 'API',
                text: body.text,
                media: null,
                isGroup: false,
                groupId: null,
            };

            this.router.handleInbound(message);
            return { status: 'queued', sessionId: session.id };
        });

        // Get current config (redacted)
        this.fastify.get('/api/config', async () => {
            // Redact sensitive values
            return {
                gateway: {
                    host: this.config.gateway.host,
                    port: this.config.gateway.port,
                },
                agent: {
                    model: this.config.agent.model,
                    maxTokens: this.config.agent.maxTokens,
                    temperature: this.config.agent.temperature,
                },
                channels: {
                    telegram: { enabled: this.config.channels.telegram.enabled },
                    discord: { enabled: this.config.channels.discord.enabled },
                    webchat: { enabled: this.config.channels.webchat.enabled },
                    cli: { enabled: this.config.channels.cli.enabled },
                },
            };
        });

        // List registered tools (placeholder for Sprint 3)
        this.fastify.get('/api/tools', async () => {
            return { tools: [] };
        });
    }

    // ─── WebSocket ────────────────────────────────────────────────

    private setupWebSocket(): void {
        this.wss.on('connection', (ws: WebSocket) => {
            const clientId = nanoid(8);
            const client: WSClient = {
                ws,
                id: clientId,
                connectedAt: Date.now(),
            };
            this.clients.set(clientId, client);

            logger.info({ clientId }, 'WebSocket client connected');

            ws.on('message', (data: Buffer) => {
                this.handleWSMessage(client, data);
            });

            ws.on('close', () => {
                this.clients.delete(clientId);
                logger.info({ clientId }, 'WebSocket client disconnected');
            });

            ws.on('error', (err) => {
                logger.error({ clientId, err }, 'WebSocket error');
            });

            // Send welcome message
            this.sendToClient(client, {
                id: nanoid(),
                type: 'config.updated',
                timestamp: Date.now(),
                payload: { message: 'Connected to Talon Gateway' },
            });
        });
    }

    private handleWSMessage(client: WSClient, data: Buffer): void {
        try {
            const msg = JSON.parse(data.toString()) as WSMessage;

            switch (msg.type) {
                case 'gateway.status': {
                    this.handleGatewayStatus(client);
                    break;
                }
                case 'session.list': {
                    this.handleSessionList(client);
                    break;
                }
                case 'session.create': {
                    this.handleSessionCreate(client, msg.payload);
                    break;
                }
                case 'session.send_message': {
                    this.handleSessionSendMessage(client, msg.payload);
                    break;
                }
                case 'session.reset': {
                    this.handleSessionReset(client, msg.payload);
                    break;
                }
                case 'tools.list': {
                    this.handleToolsList(client);
                    break;
                }
                case 'tools.invoke': {
                    this.handleToolsInvoke(client, msg.payload);
                    break;
                }
                case 'channel.message': {
                    // Legacy support
                    const payload = msg.payload as InboundMessage;
                    const sessionId = this.router.handleInbound(payload);
                    client.sessionId = sessionId;
                    break;
                }
                default:
                    logger.warn({ type: msg.type }, 'Unknown WebSocket message type');
                    this.sendToClient(client, {
                        id: nanoid(),
                        type: 'error',
                        timestamp: Date.now(),
                        payload: { error: `Unknown message type: ${msg.type}` },
                    });
            }
        } catch (err) {
            logger.error({ err }, 'Failed to parse WebSocket message');
            this.sendToClient(client, {
                id: nanoid(),
                type: 'error',
                timestamp: Date.now(),
                payload: { error: 'Invalid message format' },
            });
        }
    }

    // ─── Event Handlers ───────────────────────────────────────────

    private handleGatewayStatus(client: WSClient): void {
        const sessions = this.sessionManager.getAllSessions();
        
        this.sendToClient(client, {
            id: nanoid(),
            type: 'gateway.status',
            timestamp: Date.now(),
            payload: {
                status: 'ok',
                version: '0.4.0',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                components: {
                    gateway: 'ok',
                    sessions: 'ok',
                    agent: this.agentLoop ? 'ok' : 'disabled',
                    websocket: 'ok',
                },
                stats: {
                    sessions: sessions.length,
                    activeSessions: sessions.filter(s => s.state === 'active').length,
                    wsClients: this.clients.size,
                    totalMessages: sessions.reduce((sum, s) => sum + s.metadata.messageCount, 0),
                },
            },
        });
    }

    private handleSessionList(client: WSClient): void {
        const sessions = this.sessionManager.getAllSessions();
        
        this.sendToClient(client, {
            id: nanoid(),
            type: 'session.list',
            timestamp: Date.now(),
            payload: {
                sessions: sessions.map(s => ({
                    id: s.id,
                    senderId: s.senderId,
                    channel: s.channel,
                    state: s.state,
                    messageCount: s.metadata.messageCount,
                    createdAt: s.metadata.createdAt,
                    lastActiveAt: s.metadata.lastActiveAt,
                })),
            },
        });
    }

    private handleSessionCreate(client: WSClient, payload: unknown): void {
        const req = payload as { senderId: string; channel: string; senderName?: string };
        
        const session = this.sessionManager.createSession(
            req.senderId,
            req.channel,
            req.senderName,
        );
        
        client.sessionId = session.id;
        
        this.sendToClient(client, {
            id: nanoid(),
            type: 'session.created',
            timestamp: Date.now(),
            payload: {
                sessionId: session.id,
                senderId: session.senderId,
                channel: session.channel,
                createdAt: session.metadata.createdAt,
            },
        });
    }

    private handleSessionSendMessage(client: WSClient, payload: unknown): void {
        const req = payload as { sessionId: string; text: string; senderName?: string };
        
        const session = this.sessionManager.getSession(req.sessionId);
        if (!session) {
            this.sendToClient(client, {
                id: nanoid(),
                type: 'session.error',
                timestamp: Date.now(),
                payload: {
                    error: 'Session not found',
                    code: 'SESSION_NOT_FOUND',
                    sessionId: req.sessionId,
                },
            });
            return;
        }

        const message: InboundMessage = {
            channel: session.channel,
            senderId: session.senderId,
            senderName: req.senderName ?? 'WebSocket',
            text: req.text,
            media: null,
            isGroup: false,
            groupId: null,
        };

        this.router.handleInbound(message);
        client.sessionId = req.sessionId;
    }

    private handleSessionReset(client: WSClient, payload: unknown): void {
        const req = payload as { sessionId: string };
        
        const session = this.sessionManager.getSession(req.sessionId);
        if (!session) {
            this.sendToClient(client, {
                id: nanoid(),
                type: 'session.error',
                timestamp: Date.now(),
                payload: {
                    error: 'Session not found',
                    code: 'SESSION_NOT_FOUND',
                    sessionId: req.sessionId,
                },
            });
            return;
        }

        // Clear session history
        session.messages = [];
        session.memorySummary = '';
        session.metadata.messageCount = 0;
        this.sessionManager.persistSession(session);
        
        this.sendToClient(client, {
            id: nanoid(),
            type: 'session.reset',
            timestamp: Date.now(),
            payload: {
                sessionId: req.sessionId,
                success: true,
            },
        });
    }

    private handleToolsList(client: WSClient): void {
        // Get tools from agent loop if available
        const tools = this.agentLoop?.getRegisteredTools?.() || [];
        
        this.sendToClient(client, {
            id: nanoid(),
            type: 'tools.list',
            timestamp: Date.now(),
            payload: {
                tools: tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                })),
            },
        });
    }

    private async handleToolsInvoke(client: WSClient, payload: unknown): Promise<void> {
        const req = payload as { toolName: string; args: Record<string, unknown> };
        
        if (!this.agentLoop) {
            this.sendToClient(client, {
                id: nanoid(),
                type: 'tools.result',
                timestamp: Date.now(),
                payload: {
                    toolName: req.toolName,
                    success: false,
                    output: '',
                    error: 'Agent loop not initialized',
                },
            });
            return;
        }

        try {
            const result = await this.agentLoop.executeTool?.(req.toolName, req.args);
            
            this.sendToClient(client, {
                id: nanoid(),
                type: 'tools.result',
                timestamp: Date.now(),
                payload: {
                    toolName: req.toolName,
                    success: true,
                    output: result || '',
                },
            });
        } catch (err) {
            this.sendToClient(client, {
                id: nanoid(),
                type: 'tools.result',
                timestamp: Date.now(),
                payload: {
                    toolName: req.toolName,
                    success: false,
                    output: '',
                    error: String(err),
                },
            });
        }
    }

    // ─── Broadcast / Send ─────────────────────────────────────────

    sendToClient(client: WSClient, message: WSMessage): void {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    broadcastToSession(sessionId: string, message: WSMessage): void {
        for (const client of this.clients.values()) {
            if (client.sessionId === sessionId) {
                this.sendToClient(client, message);
            }
        }
    }

    broadcast(message: WSMessage): void {
        for (const client of this.clients.values()) {
            this.sendToClient(client, message);
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────

    async stop(): Promise<void> {
        // Close all WebSocket connections
        for (const client of this.clients.values()) {
            client.ws.close(1001, 'Server shutting down');
        }
        this.clients.clear();

        // Close WebSocket server
        this.wss?.close();

        // Close Fastify
        await this.fastify.close();

        logger.info('Talon Gateway stopped');
    }
}
