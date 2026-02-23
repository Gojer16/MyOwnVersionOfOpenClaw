# Talon Communication Protocol System

## Purpose
Standardized WebSocket-based communication protocol for real-time bidirectional messaging between clients and the Talon gateway. Defines message formats, event types, and serialization rules for all client-server interactions.

## Scope Boundaries
- **IN SCOPE**: WebSocket message schema, event type definitions, request/response payload structures, protocol versioning, error handling format
- **OUT OF SCOPE**: HTTP REST API (handled by gateway), transport layer (WebSocket implementation), authentication logic, session management
- **BOUNDARIES**: Protocol defines WHAT messages look like, not HOW they're transported. Gateway implements WebSocket server, clients implement WebSocket client using protocol definitions.

## Architecture Overview
```
Client → WebSocket → Gateway Server → Protocol Handler → [Session|Tools|Gateway] Services
    ↑         ↑              ↑               ↑
Message   Connection     Validation      Routing
Format    Management     & Parsing      & Dispatch
```

**Core Design**: JSON-based message protocol with type-safe TypeScript definitions. Bidirectional communication with request-response pattern and event publishing.

**Key Components**:
1. `WSMessage` - Base message interface with id, type, timestamp, payload
2. `MessageType` - Union of all client and server event types
3. Request/Response interfaces - Type-safe payload definitions for each message type
4. Event payloads - Structured data for system events

## Folder Structure Explanation
```
protocol/
├── index.ts              # Placeholder export file (currently empty)
└── README.md             # This documentation
```

**Note**: Protocol definitions are actually located in `utils/types.ts:42-200` rather than in this directory. This appears to be an architectural inconsistency - protocol types should be exported from this directory.

**Actual Location**: `src/utils/types.ts` contains:
- `WSMessage` interface (line 42)
- `MessageType` union (line 40)
- All request/response interfaces (lines 52-200)
- WebSocket client interface (line 202)
- Event payload types (lines 308-310)

## Public API
```typescript
// Base Message Structure
interface WSMessage {
    id: string;           // Unique message identifier
    type: MessageType;    // Event type (ClientEventType | ServerEventType)
    timestamp: number;    // Unix timestamp in milliseconds
    payload: unknown;     // Type-specific payload
}

// Client → Server Requests
interface GatewayStatusRequest {}
interface SessionListRequest {}
interface SessionCreateRequest { senderId: string; channel: string; senderName?: string; }
interface SessionSendMessageRequest { sessionId: string; text: string; senderName?: string; }
interface SessionResetRequest { sessionId: string; }
interface ToolsListRequest {}
interface ToolsInvokeRequest { toolName: string; args: Record<string, unknown>; }

// Server → Client Responses
interface GatewayStatusResponse { 
    status: 'ok' | 'degraded';
    version: string;
    uptime: number;
    timestamp: string;
    components: { gateway: 'ok' | 'error'; sessions: 'ok' | 'error'; agent: 'ok' | 'disabled' | 'error'; websocket: 'ok' | 'error'; };
    stats: { sessions: number; activeSessions: number; wsClients: number; totalMessages: number; };
}

interface SessionListResponse { sessions: Array<{ id: string; senderId: string; channel: string; state: string; messageCount: number; createdAt: number; lastActiveAt: number; }>; }
interface SessionCreateResponse { sessionId: string; }
interface SessionSendMessageResponse { success: boolean; messageId?: string; }
interface SessionResetResponse { success: boolean; }
interface ToolsListResponse { tools: Array<{ name: string; description: string; parameters: Record<string, unknown>; }>; }
interface ToolsInvokeResponse { success: boolean; output: string; error?: string; }

// Event Types
type ClientEventType = 
    | 'gateway.status'
    | 'session.list'
    | 'session.create'
    | 'session.send_message'
    | 'session.reset'
    | 'tools.list'
    | 'tools.invoke'
    | 'channel.message';  // Legacy

type ServerEventType =
    | 'config.updated'
    | 'gateway.status.response'
    | 'session.list.response'
    | 'session.create.response'
    | 'session.send_message.response'
    | 'session.reset.response'
    | 'tools.list.response'
    | 'tools.invoke.response'
    | 'error'
    | 'session.created'
    | 'session.updated'
    | 'session.deleted'
    | 'message.received'
    | 'message.sent'
    | 'tool.invoked'
    | 'tool.completed'
    | 'agent.thinking'
    | 'agent.responding'
    | 'memory.updated';

// WebSocket Client
interface WSClient {
    ws: WebSocket;
    id: string;
    connectedAt: number;
    sessionId?: string;
}
```

**Usage Pattern**:
```typescript
// Client sending message
const message: WSMessage = {
    id: 'msg_123',
    type: 'session.send_message',
    timestamp: Date.now(),
    payload: {
        sessionId: 'sess_456',
        text: 'Hello Talon',
        senderName: 'User'
    } as SessionSendMessageRequest
};
ws.send(JSON.stringify(message));

// Server handling message (gateway/server.ts:286-344)
private handleWSMessage(client: WSClient, data: Buffer): void {
    const msg = JSON.parse(data.toString()) as WSMessage;
    switch (msg.type) {
        case 'session.send_message':
            const payload = msg.payload as SessionSendMessageRequest;
            // Process message...
            break;
    }
}
```

## Internal Logic Details
**Message Flow** (`gateway/server.ts:286-344`):
1. WebSocket connection established with client
2. Client sends JSON message conforming to `WSMessage` interface
3. Server parses and validates message structure
4. Message routed based on `type` field to appropriate handler
5. Handler processes request and sends response via `sendToClient()`

**Error Handling** (`gateway/server.ts:335-343`):
- JSON parse failures caught and logged
- Unknown message types result in error response
- All errors return standardized error message format

**Event Publishing** (`gateway/server.ts:550-556`):
- System events broadcast to relevant clients
- Events include `session.created`, `session.updated`, `message.received`, etc.
- Client can subscribe to events by maintaining WebSocket connection

**Legacy Support** (`gateway/server.ts:319-325`):
- `channel.message` type provides backward compatibility
- Routes to `MessageRouter.handleInbound()` for channel-based messaging
- Automatically sets `client.sessionId` for subsequent messages

**Message Validation**: Missing schema validation. Messages are type-cast but not validated against interfaces. Suggested: Add Zod schemas for each message type.

## Data Contracts
**Base Message Format**:
```json
{
    "id": "msg_abc123",
    "type": "session.send_message",
    "timestamp": 1678901234567,
    "payload": {
        "sessionId": "sess_def456",
        "text": "Hello world",
        "senderName": "User"
    }
}
```

**Error Response Format**:
```json
{
    "id": "err_xyz789",
    "type": "error",
    "timestamp": 1678901234567,
    "payload": {
        "error": "Invalid message format"
    }
}
```

**Event Format**:
```json
{
    "id": "evt_123",
    "type": "session.created",
    "timestamp": 1678901234567,
    "payload": {
        "sessionId": "sess_abc",
        "senderId": "user_123",
        "channel": "cli"
    }
}
```

**WebSocket URL**: `ws://{host}:{port}/ws` (configured in gateway settings)

**Connection Requirements**:
- Client must handle reconnection logic
- Messages should include unique `id` for correlation
- Timestamps in milliseconds since Unix epoch
- All strings UTF-8 encoded

## Failure Modes
1. **Invalid JSON** (`gateway/server.ts:335-343`): Catches `JSON.parse()` errors, logs, and sends error response.

2. **Unknown Message Type** (`gateway/server.ts:326-334`): Logs warning and returns error response with `"Unknown message type: ${type}"`.

3. **Missing Required Fields**: Unhandled - type casting assumes correct structure. Missing: Schema validation for required fields.

4. **WebSocket Connection Loss**: Client must implement reconnection logic. Server cleans up client state on disconnect.

5. **Malformed Payload**: Handler methods may throw if payload doesn't match expected structure. Missing: Payload validation before processing.

6. **Session Not Found**: `session.send_message` with invalid sessionId may fail silently. Missing: Error response for invalid session references.

**Recovery Strategies**:
- Client should implement exponential backoff for reconnections
- Message IDs enable request-response correlation
- Missing: Message queuing for offline clients
- Missing: Message retry with deduplication

## Observability
**Current State**: Basic logging at connection/disconnection and message processing errors.

**Log Events**:
- WebSocket client connected: `{ clientId }`
- WebSocket client disconnected: `{ clientId }`
- WebSocket error: `{ clientId, err }`
- Failed to parse message: `{ err }`
- Unknown message type: `{ type }`

**Missing Observability**:
1. **Metrics**: Message rates by type, payload sizes, processing latency, error rates
2. **Tracing**: Message flow across components, correlation IDs for request chains
3. **Health Checks**: WebSocket connection stability, message queue depth
4. **Audit Log**: All messages with sanitized payloads for security auditing

**Required Enhancements**:
- Protocol version negotiation and compatibility tracking
- Message schema validation metrics
- Client connection quality monitoring
- Payload size limits and enforcement

## AI Agent Instructions
**Protocol Implementation Guidelines**:
1. **Message Structure**: All messages must include `id`, `type`, `timestamp`, `payload` fields.

2. **Type Safety**: Use TypeScript interfaces from `utils/types.ts` for compile-time validation.

3. **Error Handling**: Always include `id` in error responses for client correlation.

4. **Event Sequencing**: Client should handle out-of-order message delivery (WebSocket doesn't guarantee order).

5. **Connection Management**: Implement ping/pong heartbeat (missing in current implementation).

**Message Type Usage**:
- **Client Requests**: Use `gateway.status`, `session.*`, `tools.*` for specific operations
- **Server Responses**: Corresponding `.response` types for request acknowledgments
- **System Events**: Subscribe to `session.*`, `message.*`, `agent.*`, `tool.*`, `memory.*` events for real-time updates

**Payload Design**:
- Keep payloads minimal and focused
- Use consistent naming conventions (camelCase)
- Include all required fields, mark optional fields with `?`
- Document payload structures in TypeScript interfaces

**Integration Points**:
- Gateway WebSocket server handles protocol messages in `server.ts:251-344`
- Message routing based on `type` field to appropriate service handlers
- Event bus integration for system event publishing
- Channel compatibility via `channel.message` legacy type

**Security Considerations**:
- Validate all incoming message payloads
- Sanitize message content before processing
- Implement rate limiting per client
- Add message size limits to prevent DoS
- Consider message signing for authenticated clients

## Extension Points
1. **Protocol Versioning**: Add `version` field to messages with backward/forward compatibility.

2. **Message Compression**: Add support for compressed payloads (gzip, brotli).

3. **Batch Operations**: Support batch messages for multiple operations in single request.

4. **Subscription Model**: Allow clients to subscribe/unsubscribe to specific event types.

5. **Query Language**: Add advanced query capabilities for session/tool listing with filters.

6. **Binary Payloads**: Support binary data (images, files) alongside JSON metadata.

7. **Protocol Bridges**: Add adapters for other protocols (MQTT, SSE, gRPC-Web).

8. **Message Validation**: Add runtime schema validation with detailed error messages.

**Hook System** (Missing): No pre/post message processing hooks. Suggested: `MessageMiddleware` for authentication, validation, logging, transformation.

**Protocol Extensions** (Missing): No official extension mechanism. Suggested: `x-` prefixed fields for experimental features, plugin-defined message types.

## Technical Debt & TODO
**HIGH PRIORITY**:
1. **Schema Validation**: Add Zod schemas for all message types with runtime validation
2. **Protocol Versioning**: Add version field and compatibility handling
3. **Error Handling**: Standardized error codes and detailed error messages
4. **Security**: Add message signing, payload validation, rate limiting

**MEDIUM PRIORITY**:
5. **Documentation**: Generate OpenAPI/Swagger documentation for WebSocket protocol
6. **Testing**: Protocol compliance tests, fuzzing, backward compatibility tests
7. **Observability**: Comprehensive metrics, tracing, and monitoring
8. **Connection Management**: Ping/pong heartbeat, automatic reconnection guidance

**LOW PRIORITY**:
9. **Protocol Bridges**: Support for alternative transports (SSE, MQTT)
10. **Binary Support**: Efficient binary payload handling
11. **Batch Operations**: Multi-message request/response
12. **Caching**: Response caching for idempotent operations

**ARCHITECTURAL DEBT**:
- Protocol definitions scattered (`utils/types.ts` instead of `protocol/` directory)
- No interface for protocol handler - concrete implementation in `gateway/server.ts`
- Missing abstraction for transport layer (WebSocket specific)
- No protocol version negotiation
- Hardcoded message type strings - should be enum/const

**PERFORMANCE CONSIDERATIONS**:
- JSON parsing overhead for each message
- No message compression for large payloads
- Missing connection pooling for high-volume clients
- No message batching for efficiency

**SECURITY DEBT**:
- No message signing or integrity verification
- No payload size limits
- No rate limiting per client
- No authentication at protocol level (relies on transport)
- Missing: Encryption for sensitive payload fields