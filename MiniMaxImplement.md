# MiniMax - Implementation Status

> **Progress Update**: Major features complete! Browser automation, subagents, productivity tools, and Shadow Loop implemented.

## ✅ Already Complete (~85%)
- Gateway with WebSocket server
- Session management and routing
- Agent runtime with multi-provider support (DeepSeek, OpenRouter, OpenAI)
- Memory compression
- Multi-channel (Telegram, WhatsApp, CLI, TUI)
- File, shell, web search tools
- Configuration system with hot reload
- **Shadow Loop** - Proactive filesystem watching
- **Browser Automation** - 5 Puppeteer tools
- **Subagent System** - 5 specialized agents (97% cost savings)
- **Productivity Tools** - Notes, tasks, Apple integrations (13 tools)
- **Enhanced Agent Awareness** - Tool categories and proactive usage
- **323 Tests** - 100% passing

---

## 🚧 MISSING IMPLEMENTATIONS

### 1. Discord Channel Integration ❌

**Status:** Not implemented

**What Needs to Be Built:**
```
src/channels/discord/
├── index.ts          # Discord bot using discord.js
└── commands.ts       # Slash commands
```

**Features Needed:**
- Bot authentication and connection
- Text channel message handling
- Direct message support
- Thread support
- Slash commands
- Mention detection in groups

---

### 2. WebChat UI ❌

**Status:** Not implemented

**What Needs to Be Built:**
```
ui/chat/
├── src/
│   ├── components/
│   │   ├── Chat.tsx
│   │   ├── MessageList.tsx
│   │   └── Input.tsx
│   └── hooks/
│       └── useWebSocket.ts
```

**Features Needed:**
- React-based chat interface
- WebSocket connection to gateway
- Message history display
- Real-time streaming responses
- Session management UI

---

### 3. OS Integration Tools ❌

**Status:** Not implemented

**What Needs to Be Built:**
```
src/tools/os.ts
```

**Tools Needed:**
- `os_notify` - System notifications
- `clipboard_read` - Read clipboard
- `clipboard_write` - Write clipboard
- `screen_capture` - Take screenshots

---

### 4. Vector/SQLite Storage ❌

**Status:** Not implemented

**What Needs to Be Built:**
```
src/memory/
├── vector.ts         # Vector embeddings
├── sqlite.ts         # SQLite database
└── search.ts         # Semantic search
```

**Features Needed:**
- SQLite database for conversations
- Vector embeddings for semantic search
- Searchable history across sessions

---

### 5. Mobile Apps ❌

**Status:** Not implemented (Phase 3)

**What Needs to Be Built:**
- macOS menu bar app
- iOS node with Canvas
- Android node with Canvas

---

### 6. Voice Features ❌

**Status:** Not implemented (Phase 3)

**What Needs to Be Built:**
- Voice Wake (wake word detection)
- Talk Mode (push-to-talk)
- Speech-to-text
- Text-to-speech

---

### 6. Canvas Rendering ❌

**Status:** Not implemented (Phase 3)

**What Needs to Be Built:**
- A2UI renderer integration
- Canvas protocol
- Interactive elements

---

### 7. Advanced Features ❌

**Missing:**
- ❌ Cron scheduling (schema exists, not used)
- ❌ Webhooks
- ❌ Tailscale integration for remote access
- ❌ Slack channel
- ❌ Signal channel
- ❌ iMessage integration

---

## 📋 Implementation Priority

### Phase 1: Core Channels (High Priority)
1. Discord bot integration
2. WebChat UI (React)

### Phase 2: Browser Automation (Medium Priority)
1. Puppeteer/Playwright integration
2. Browser control tools

### Phase 3: Advanced Features (Low Priority)
1. Voice features
2. Canvas rendering
3. Mobile apps
4. Additional channels (Slack, Signal)

---

## 📊 Current Progress: ~70% Complete

**What Works:**
- Gateway ✅
- Agent loop ✅
- Memory compression ✅
- Telegram, WhatsApp, CLI, TUI ✅
- File/shell/web tools ✅

**What's Missing:**
- Discord ❌
- Browser automation ❌
- WebChat UI ❌
- Voice ❌
- Canvas ❌
- Mobile apps ❌

---

## 1. System Overview and Design Philosophy

MiniMax represents a fundamental shift in how users interact with AI assistants. Rather than accessing AI capabilities through a web interface or mobile app that routes data through third-party servers, MiniMax brings the AI directly to the user's existing communication platforms. Whether sending a message through Telegram, Discord, or a web-based chat interface, users engage with the same consistent AI personality that has full visibility into their system context.

The system architecture follows a gateway-centric model where a central Gateway process orchestrates all interactions. This Gateway serves as the single source of truth for session management, channel routing, tool execution, and event handling. By consolidating these responsibilities in one place, MiniMax achieves consistency across diverse communication channels while maintaining a clean separation of concerns between the transport layer and the AI logic layer.

Privacy constitutes the foundational principle driving MiniMax's design. Every component operates with the understanding that user data remains under user control. The AI assistant does not transmit system context, file contents, or command outputs to external services unless explicitly authorized by the user. This stands in stark contrast to many commercial AI assistants that necessarily process user data on cloud infrastructure. With MiniMax, sensitive information such as financial documents, personal communications, and system credentials never leave the local environment unless the user specifically instructs the assistant to do so.

Extensibility represents another key design consideration. MiniMax must accommodate a wide range of use cases and user preferences. Some users may desire tight integration with specific productivity tools, while others might prioritize voice interaction or visual canvas capabilities. The architecture supports this diversity through a plugin system that allows adding new channels, tools, and capabilities without modifying the core system. This approach ensures MiniMax can evolve alongside user needs without requiring fundamental architectural changes.

---

## 2. Core Architecture Components

### 2.1 Gateway

The Gateway constitutes the central nervous system of MiniMax, mediating all communication between users, AI agents, and system resources. Implemented as a long-running process, the Gateway binds to a local network interface and exposes multiple interfaces for interaction. The primary control plane operates over WebSocket connections, enabling real-time bidirectional communication with clients, tool execution streams, and event propagation.

The Gateway maintains responsibility for several critical functions. Session management encompasses creating, tracking, and cleaning up conversational contexts. Each interaction with the AI occurs within a session that maintains conversation history, user preferences, and accumulated context. The Gateway tracks these sessions across all connected channels, enabling seamless continuity even when users switch between communication platforms.

Channel management represents another Gateway responsibility. The Gateway maintains persistent connections to configured messaging platforms, handling authentication, rate limiting, and message routing. When a message arrives through any channel, the Gateway identifies the appropriate session based on sender identity and channel rules, forwards the message to the AI agent for processing, and routes the response back through the original channel.

The Gateway also serves as the orchestration layer for tool execution. When the AI determines that external actions are necessary—such as reading a file, executing a command, or browsing a website—the Gateway coordinates these operations. It validates tool permissions against security policies, executes the requested operations, and streams results back to the AI agent for incorporation into the response.

Configuration management completes the Gateway's core responsibilities. All system settings, including channel credentials, security policies, and agent parameters, flow through the Gateway. Changes to configuration take effect immediately without requiring service restarts, enabling dynamic adaptation to changing requirements.

### 2.2 Agent Runtime

The Agent Runtime executes the AI model and manages its interaction with the tool system. MiniMax supports multiple execution modes to accommodate different model providers and deployment scenarios. The primary mode uses RPC communication with an external agent binary, allowing the Gateway to offload model inference while maintaining tight integration through structured message passing.

The agent runtime implements a streaming architecture for both thought processes and tool execution. Rather than waiting for complete responses, the system streams intermediate results as they become available. This approach significantly improves perceived responsiveness, especially for complex operations that involve multiple tool invocations or lengthy reasoning chains.

Context management within the agent runtime handles the delicate balance between comprehensive context and token limits. The runtime maintains conversation history, system prompts, and injected context files, applying compression and summarization techniques when conversations exceed practical length limits. Users can configure the aggressiveness of context compaction based on their specific needs and available model context windows.

Model selection and failover capabilities ensure continuous availability even when preferred models become unavailable. The runtime maintains a prioritized list of model configurations and automatically attempts the next available model when the primary choice fails. This approach also enables cost optimization by falling back to cheaper models for routine tasks while reserving more capable (and expensive) models for complex reasoning.

### 2.3 Client Interfaces

MiniMax provides multiple client interfaces to accommodate diverse usage scenarios and user preferences. Each interface connects to the Gateway through well-defined protocols, ensuring consistent behavior regardless of the access method.

The Web Control UI offers the most comprehensive client experience. Served directly by the Gateway, this browser-based interface provides chat functionality, session management, configuration editing, and system diagnostics. Users access the Control UI through a local web server running alongside the Gateway, with optional remote access through secure tunneling mechanisms.

The Command Line Interface provides scriptable access to MiniMax capabilities. Developers and power users can send messages, manage sessions, invoke tools directly, and configure the system through command-line invocations. The CLI proves particularly valuable for automation, integration with existing shell workflows, and debugging.

Native applications extend MiniMax presence to mobile and desktop platforms. macOS, iOS, and Android applications provide optimized experiences with platform-specific capabilities such as voice input, push notifications, and system integration. These applications connect to the Gateway over encrypted channels, enabling secure remote access when the Gateway is exposed through tunneling services.

---

## 3. Channel Integrations

### 3.1 Supported Platforms

MiniMax maintains integration with a diverse set of communication platforms, enabling users to interact with their AI assistant through their preferred messaging applications. The channel system abstracts platform-specific details behind a unified interface, ensuring consistent AI behavior regardless of how the user chooses to connect.

Telegram integration uses the grammY framework for bot management and message handling. The integration supports direct messages, group chats, and channel communications, with appropriate routing rules for each conversation type. Voice messages undergo transcription before processing, while outgoing messages can include text, images, videos, and interactive keyboards.

Discord integration leverages discord.js for guild and channel management. The integration handles text channels, voice channel events, and direct messages, with proper permission checking for each operation. MiniMax can participate in Discord threads, respond to mentions, and execute slash commands, providing a native-feeling interaction model.

WhatsApp integration utilizes the Baileys library for WhatsApp Web protocol implementation. This integration enables message handling across individual and group chats, with support for media messages, status updates, and presence information. The integration maintains session persistence to avoid repeated authentication flows.

Slack integration employs the Bolt framework for workspace interaction. The integration supports direct messages, channel messages, and thread replies, with proper Slack app permission scoping. Interactive components such as modals and interactive messages enable rich interaction patterns beyond simple text exchanges.

Additional platform integrations extend MiniMax reach to Signal, Google Chat, Microsoft Teams, iMessage (through BlueBubbles), Matrix, and custom WebChat implementations. Each integration follows the same architectural pattern: maintain a persistent connection to the platform, translate incoming messages into a canonical format, and route outgoing responses back through the appropriate platform API.

### 3.2 Routing and Session Management

The routing system determines how incoming messages map to sessions and how responses flow back to the correct recipients. This system must balance several competing concerns: maintaining conversation continuity, isolating different contexts appropriately, and handling the complexities of group conversations.

Per-sender session isolation ensures that each unique user receives their own conversational context. When a user initiates contact through any channel, the Gateway creates a new session or resumes an existing session based on user identity. This approach prevents cross-contamination between conversations while enabling the AI to build persistent understanding of each user's preferences and requirements.

Group conversation handling requires more nuanced routing logic. The system supports multiple activation modes that determine when the AI should respond in group settings. Mention-only mode triggers responses only when explicitly addressed by name or mention. Always-on mode makes the AI available to all group members. Configurable modes allow fine-tuning this behavior based on group purpose and membership.

Cross-channel continuity enables users to maintain the same conversation across different platforms. When properly configured, a user can begin a discussion on Telegram and continue it later through Discord without losing context. This capability requires consistent user identity mapping across channels, typically achieved through explicit user linking configuration.

Message transformation handles the translation between channel-specific formats and the canonical message format used internally. Rich content such as formatted text, images, and interactive elements undergoes appropriate conversion to ensure fidelity while respecting platform limitations. Outgoing messages similarly transform from the internal format to channel-appropriate representations.

---

## 4. Tool System and Capabilities

### 4.1 File System Access

The file system tool category provides comprehensive read and write capabilities across the user's machine. These tools enable the AI assistant to work directly with user data, making them among the most powerful and potentially risky capabilities in the system.

Read operations support various granularity levels. Single file reading retrieves specific file contents for analysis or processing. Directory listing enables exploration of folder structures. Recursive operations can traverse entire directory trees, though configurable depth limits prevent excessive resource consumption. Glob patterns allow selective file matching based on naming conventions.

Write operations enable the AI to create and modify files. File creation generates new files with specified content. Append operations add content to existing files without overwriting. Directory creation establishes new folder structures as needed for organizing user data. These operations respect file permissions and will fail gracefully when attempting to modify protected resources.

Safety mechanisms protect against unintended operations. Confirmation requirements can enforce explicit user approval before destructive operations such as file deletion or overwrite. Path restrictions limit accessible directories to user-specified locations, preventing accidental access to sensitive system areas. Operation logging maintains audit trails for accountability.

### 4.2 Shell Command Execution

The shell execution capability enables running system commands and scripts directly on the user's machine. This powerful capability bridges the gap between conversational interaction and actual system manipulation, allowing the AI to perform complex automation tasks.

Command execution runs arbitrary shell commands through the system shell, returning stdout, stderr, and exit codes to the AI for incorporation into responses. The AI can then analyze command output, make decisions based on results, and chain multiple commands together to accomplish complex objectives.

Script execution extends command capabilities by running executable scripts in various languages. Shell scripts, Python programs, and other interpretable code can be invoked directly, with output captured and processed. This capability enables sophisticated automation workflows that go beyond simple command invocation.

Process management allows the AI to start, monitor, and terminate long-running processes. Background processes can be initiated and left running, with the AI maintaining awareness of their state. Process termination enables cleanup when operations complete or when users request cancellation.

### 4.3 Browser Control

Browser control provides MiniMax with web interaction capabilities, enabling automated browsing, form filling, and data extraction. This capability transforms the AI from a passive assistant into an active agent capable of navigating the web on the user's behalf.

The browser operates as a dedicated instance managed by MiniMax, avoiding conflicts with the user's normal browsing session. Chrome DevTools Protocol integration provides fine-grained control over page navigation, element interaction, and content extraction. Each browsing session can use isolated profiles to maintain separation between different browsing contexts.

Navigation and interaction capabilities include URL opening, link clicking, form field manipulation, and button activation. The AI can complete multi-step workflows that require sequential interactions, such as logging into websites, navigating through多层 menus, or submitting forms.

Data extraction pulls structured information from web pages. The AI can identify and extract specific elements based on selectors, transform raw HTML into more usable formats, and compile extracted data into summaries or structured outputs. This capability proves valuable for research, monitoring, and data aggregation tasks.

---

## 5. Persistent Memory and Context

### 5.1 Session Persistence

Session persistence ensures conversational continuity across restarts and enables the AI to develop long-term understanding of user preferences. The system maintains structured storage of conversation history, user preferences, and accumulated context.

Conversation history storage preserves complete transcript logs for each session. Messages, tool invocations, and AI responses all undergo durable storage, enabling retrieval of past discussions. Storage formats support efficient retrieval while maintaining searchable structure.

User preference tracking captures explicit and implicit user preferences over time. Explicit preferences come from direct user instructions about desired behavior, response style, or task handling. Implicit preferences emerge from observed patterns in user interactions, enabling the AI to adapt without explicit direction.

Context injection integrates relevant historical information into active conversations. When a session resumes, the AI receives synthesized context highlighting previous discussions relevant to current topics. This approach enables the AI to reference past work without overwhelming the model with complete conversation logs.

### 5.2 Knowledge Management

Beyond conversation history, MiniMax maintains structured knowledge that shapes AI behavior and capabilities. This knowledge base encompasses system prompts, skill definitions, and user-specific information.

System prompt management controls the foundational instructions that define AI behavior. These prompts establish personality characteristics, capability boundaries, and operational guidelines. Users can customize system prompts to tailor AI behavior for specific use cases or preferences.

Skill definitions provide structured specifications for extended capabilities. Skills define available tools, behavioral patterns, and context requirements for specialized tasks. The skill system enables adding new capabilities without modifying core system components, supporting the extensibility design principle.

User profile storage maintains structured information about users, including names, preferences, and relevant background. This information injects appropriately into conversations, enabling personalized interactions without requiring users to重复 provide the same information.

---

## 6. Voice and Multimedia

### 6.1 Voice Interaction

Voice interaction capabilities enable hands-free engagement with MiniMax, transforming the AI from a text-based assistant into a conversational partner. These capabilities require careful implementation to balance responsiveness, accuracy, and privacy.

Voice activation allows MiniMax to listen for wake words or activation phrases, enabling always-available voice interaction. The system monitors audio input for trigger phrases, activating full speech processing when detected. Users can configure activation sensitivity and wake word preferences.

Push-to-talk mode provides explicit control over voice activation, processing audio only while the user actively holds a talk button. This mode eliminates false activations while still providing convenient hands-free interaction. Mobile applications typically implement push-to-talk as the primary voice input method.

Speech-to-text processing converts voice input into text for AI processing. Multiple backend options support different deployment scenarios, from cloud-based services to local processing. Transcription results flow to the AI as regular text input, enabling seamless voice-driven conversations.

Text-to-speech output generates audible AI responses. Voice selection from multiple options allows personality customization. Speaking rate and volume controls accommodate user preferences. Output can play through system audio or redirect to file storage.

### 6.2 Canvas and Visual Interface

Canvas provides an interactive visual workspace where the AI can render information, diagrams, and interactive elements. This capability enables richer information presentation than text alone supports.

The Canvas system operates through a dedicated rendering layer that receives structured commands from the AI. These commands specify elements to render, their properties, and layout relationships. The renderer produces interactive visual output that users can manipulate directly.

Element types span a wide range of visualization needs. Text blocks present information in readable formats. Images and media display visual content. Charts and graphs visualize data relationships. Interactive controls enable user input within the Canvas context.

State synchronization maintains consistency between Canvas state and AI awareness. User interactions with Canvas elements generate events that flow back to the AI, enabling responsive visual interfaces. The AI can update Canvas content based on conversation progression or user actions.

---

## 7. Security Architecture

### 7.1 Access Control

The security model implements defense in depth through multiple layers of access control. These controls protect system resources, user data, and AI capabilities from unauthorized use while enabling legitimate access for authorized users.

User authentication verifies identity before granting access to AI capabilities. Local authentication relies on configured credentials stored securely on the system. Integration with authentication providers extends this to external identity systems. Multi-factor authentication provides additional protection for sensitive deployments.

Channel-level authorization controls which platforms and users can access MiniMax. Configuration specifies allowed origins for each channel, preventing unauthorized access even if channel credentials are compromised. Group chat authorization adds additional controls for multi-user environments.

Tool permissioning restricts which tools particular sessions can access. Main sessions typically receive full tool access, while group or sandboxed sessions receive restricted capabilities. Permission sets can include allowlists and denylists, enabling fine-grained control over available operations.

### 7.2 Sandbox Isolation

Sandbox isolation provides additional protection by running potentially risky operations in restricted environments. This containment limits the blast radius of security incidents and prevents accidental damage from tool misuse.

The sandbox implementation leverages container technology to isolate tool execution. Each sandboxed operation runs in an ephemeral container with limited filesystem access, restricted network capabilities, and controlled resource consumption. Operations that require host access can be allowlisted explicitly.

Sandbox policies define default restrictions and permitted exceptions. Default-deny policies ensure that only explicitly allowed operations succeed. Policy configuration happens at the Gateway level, with session-specific overrides possible for particular use cases.

Resource limits prevent denial-of-service through excessive resource consumption. CPU time, memory usage, and filesystem operations all undergo limits. Long-running operations can be terminated automatically when they exceed configured thresholds.

### 7.3 Data Protection

Data protection measures safeguard user information throughout the system. These measures address both data at rest (stored data) and data in transit (transmitted data).

Encryption for stored data protects information persisted to disk. Sensitive configuration elements such as API keys and credentials undergo encryption using user-provided keys. Session storage can optionally encrypt conversation history for additional privacy.

Transport encryption secures all network communications. Gateway connections use TLS encryption by default, preventing eavesdropping on local networks. Remote access through tunnels requires appropriate security configurations to maintain encryption end-to-end.

Audit logging maintains records of system activities for security review and incident investigation. Logs capture authentication attempts, tool invocations, and configuration changes. Log retention policies balance storage costs against security requirements.

---

## 8. Configuration and Deployment

### 8.1 Configuration Structure

Configuration management provides flexibility while maintaining sensible defaults. The hierarchical configuration system enables overriding defaults at appropriate levels without requiring complete specification of all parameters.

The primary configuration file resides in the user's home directory under a hidden folder specific to MiniMax. This location maintains separation from other application configurations while remaining accessible for manual editing when necessary.

Configuration sections organize related settings into manageable groups. Gateway settings control network binding, authentication, and remote access. Channel configurations specify connection parameters for each integrated platform. Agent settings control model selection and behavior parameters. Security policies define access controls and sandbox rules.

Configuration validation ensures correctness before applying changes. The Gateway validates configuration syntax and semantic correctness during loading, reporting errors without crashing. Runtime configuration hot-reloading applies changes without service interruption.

### 8.2 Deployment Patterns

MiniMax supports multiple deployment configurations to accommodate diverse use cases and infrastructure preferences. Selection among these patterns depends on requirements for accessibility, performance, and security.

Local deployment runs the Gateway on the same machine where the user works. This configuration provides lowest latency for tool operations and simplest security model. Local deployment suits single-user scenarios where the AI assists primarily with tasks on the local machine.

Remote deployment places the Gateway on a separate machine, typically a always-on server or cloud VM. Users connect through client applications or web interfaces. This configuration enables access from multiple devices while centralizing AI capabilities. Remote access requires secure tunneling or VPN configuration for safe exposure.

Hybrid deployment combines local and remote elements. The Gateway runs remotely while device nodes provide local capabilities such as file access, command execution, or media capture. This approach balances accessibility with local resource utilization.

### 8.3 Remote Access

Remote access enables connecting to MiniMax from outside the local network. Several mechanisms support different security postures and infrastructure scenarios.

Tailscale integration provides secure tunnel creation without complex firewall configuration. MiniMax can automatically configure Tailscale Serve for tailnet-only access or Funnel for public HTTPS exposure. These configurations respect security settings, requiring authentication before granting access.

SSH tunneling provides another remote access pathway for users with existing SSH infrastructure. Creating an SSH tunnel to the Gateway machine enables WebSocket connection through the established channel. This approach works well for users already managing SSH access.

Web server exposure enables direct HTTPS access to the Gateway's web interfaces. Proper TLS certificate configuration ensures encrypted transport. Authentication requirements prevent unauthorized access even when the service becomes publicly reachable.

---

## 9. Extension System

### 9.1 Skills Architecture

Skills extend MiniMax capabilities beyond the core toolset, enabling specialized functionality for particular domains or workflows. The skill architecture provides a standardized framework for defining, discovering, and managing extensions.

Skill definition follows a declarative structure that specifies capability metadata, required tools, behavioral prompts, and configuration options. Skills can declare dependencies on other skills, enabling composition of more complex capabilities from simpler building blocks.

Skill discovery enables automatic detection of available capabilities. The skill registry scans designated directories for skill definitions, building an index of available functionality. This index informs the AI about capabilities it can leverage when processing user requests.

Skill lifecycle management handles installation, activation, and removal. Users install skills by adding them to the skills directory. Activation makes skills available for use during AI processing. Removal cleanly deletes skill files and associated configuration.

### 9.2 Plugin Channels

Plugin channels extend platform support beyond the built-in integrations. The plugin system enables community contributions and third-party development without requiring changes to the core Gateway codebase.

Channel plugin architecture defines interfaces that platform integrations must implement. These interfaces cover message sending and receiving, authentication flows, presence management, and media handling. Plugins implementing these interfaces integrate seamlessly with the Gateway's routing and session systems.

Plugin distribution occurs through package management compatible with the host system's dependency tools. Users install plugins by adding them to the configuration and ensuring required dependencies are available. Version management helps maintain compatibility between plugins and core system versions.

---

## 10. Monitoring and Maintenance

### 10.1 Logging and Diagnostics

Comprehensive logging supports troubleshooting, security auditing, and performance analysis. The logging system captures detailed information about system operations while maintaining manageable storage requirements.

Log categories organize output by component and severity. Gateway operations log connection events, routing decisions, and configuration changes. Agent logs capture model interactions, tool invocations, and responses. Channel logs detail message flow and platform interactions.

Log rotation prevents unbounded storage growth while maintaining historical access. Size-based and time-based rotation policies combine to balance storage usage against historical depth. Archive policies enable long-term retention for compliance or investigation purposes.

Diagnostic tools provide structured access to system health information. The Gateway exposes status endpoints that report connection states, session counts, and resource utilization. Health check mechanisms support container orchestration and monitoring system integration.

### 10.2 Health Monitoring

Health monitoring ensures continuous availability and early detection of issues. Automated monitoring complements manual observation by providing continuous oversight.

Connection health tracking monitors channel connectivity status. The system detects disconnection events, attempts automatic reconnection, and escalates persistent failures for user notification. Connection metrics inform capacity planning and reliability assessment.

Resource monitoring tracks CPU, memory, and network utilization. Thresholds trigger alerts when resources approach limits, enabling proactive response before performance degradation occurs. Historical resource data supports trend analysis and capacity planning.

Process health maintains awareness of Gateway and component process states. Unexpected termination triggers restart attempts and notification. Process monitoring integrates with system service management for appropriate lifecycle handling.

---

## 11. Future Considerations

### 11.1 Scalability Pathways

While MiniMax targets single-user scenarios, the architecture accommodates growth for multi-user or high-volume deployments. Scaling pathways address increased demand without fundamental architectural changes.

Horizontal scaling through multiple Gateway instances can distribute load across available resources. Channel connections distribute across instances, with shared session storage maintaining consistency. Load balancing routes requests appropriately across the instance pool.

Caching strategies reduce redundant processing and improve response times. Session state caching minimizes database load. Tool result caching avoids repeated expensive operations. Model response caching provides instant replies for frequently-asked queries.

Resource optimization improves efficiency within existing capacity. Context compression reduces token consumption. Tool batching consolidates multiple operations. Asynchronous processing improves throughput for non-blocking operations.

### 11.2 Capability Expansion

The extension architecture supports continuous capability enhancement without core system modification. Several expansion pathways merit consideration for future development.

Enhanced multimodal capabilities could expand beyond current voice and canvas features. Image generation and understanding, video processing, and advanced audio manipulation represent potential expansion areas. Integration with specialized models could provide these capabilities without impacting core inference.

Deeper system integration offers additional automation possibilities. Desktop environment control, window management, and application automation extend AI reach into daily workflow. Platform-specific APIs on macOS, Windows, and Linux provide varying integration depths.

Collaborative features could enable multi-user AI assistance. Shared sessions for pair programming, team knowledge bases, and collaborative problem-solving extend the personal assistant model to group contexts while maintaining privacy boundaries.

---

## 12. Implementation Priorities

### 12.1 Phase One: Core Foundation

Initial implementation focuses on establishing the fundamental architecture. Gateway development provides the orchestration backbone that connects all other components. Basic channel integrations for Telegram and Discord enable early user engagement. Essential tool capabilities—file access and shell execution—provide practical utility.

The Phase One scope delivers a functional personal assistant that users can deploy locally and access through at least one chat platform. Core session management ensures conversation continuity. Configuration system establishes the foundation for customization.

Success criteria for Phase One include successful local deployment, message exchange through configured channels, file operations executing correctly, and shell commands returning expected output. Users should be able to install, configure, and use the basic system without encountering blocking issues.

### 12.2 Phase Two: Capability Enhancement

Phase Two expands functionality to deliver more comprehensive assistance. Browser control provides web automation capabilities. Voice interaction enables hands-free engagement. Canvas delivers visual workspace capabilities. Additional channel integrations broaden accessibility.

Security hardening accompanies capability expansion. Sandbox implementation provides isolation for risky operations. Authentication strengthens access control. Audit logging enables security monitoring.

Phase Two delivers a more capable system that handles diverse interaction modalities and provides stronger security guarantees. Users gain access to more powerful automation tools while maintaining appropriate protection boundaries.

### 12.3 Phase Three: Ecosystem Development

Phase Three focuses on extensibility and community building. Skills system enables third-party capability extensions. Plugin architecture supports additional channel integrations. Documentation and examples lower barriers to contribution.

Advanced features that require significant development investment enter scope during Phase Three. Cross-device synchronization, advanced automation workflows, and enterprise features expand the addressable market while maintaining the personal assistant core value proposition.

---

## 13. Memory Strategy

The memory strategy represents one of MiniMax's key advantages over OpenClaw. By implementing intelligent context management, the system maintains conversational continuity while keeping token usage minimal and predictable.

### 13.1 Context Window Principles

MiniMax follows a strict rule: never send full chat history to the model. This principle prevents context window overflow, reduces token costs, and ensures consistent performance regardless of conversation length. The memory strategy operates on four distinct components that combine to create comprehensive yet efficient context injection.

The first component consists of the system prompt, which establishes the AI's personality, capabilities, and behavioral guidelines. This prompt remains relatively static and only changes when fundamental AI behavior requires modification. The system prompt provides foundational instructions that shape all interactions.

The second component is the memory summary, capped at a maximum of 800 tokens. This summary captures the essential information about the user and current working context. It includes the user's name, stated goals and preferences, important facts learned during interactions, and active projects or tasks. The memory summary persists across sessions and evolves through explicit updates and implicit learning.

The third component comprises the last five to ten user messages, providing recent conversational context. This window captures the immediate discussion thread, enabling the AI to understand and respond appropriately to recent requests. When the conversation grows beyond this window, older messages compress into the memory summary.

The fourth component includes tool results, which undergo truncation to prevent excessive token consumption. Long command outputs, file contents, and web search results get summarized or trimmed while preserving essential information. This prevents tool usage from consuming the majority of available context space.

### 13.2 Memory Summary Structure

The memory summary follows a structured format that facilitates quick parsing and consistent updates. This structure organizes information into distinct categories that the AI can easily reference and that memory compression can efficiently update.

User profile information captures biographical and preference data. This includes the user's name, stated goals, communication preferences, and behavioral expectations. For example, some users prefer direct advice without lengthy explanations, while others want comprehensive reasoning. The profile captures these preferences explicitly.

Current task tracking maintains awareness of ongoing work. When users request multi-step projects, the memory summary tracks progress, pending items, and recent decisions. This prevents the AI from repeating completed work or losing track of project state across conversation gaps.

Decision logs record important choices made during interactions. These include model selections, tool choices, and approach decisions. Recording decisions enables the AI to maintain consistency and avoid contradicting previous conclusions.

Important facts capture persistent information that the AI should remember. This includes technical preferences, relevant context about the user's environment, and factual information provided during conversation. Facts get updated when users provide new information that contradicts previous entries.

Next steps enumeration maintains a forward-looking view of pending work. When tasks involve multiple steps, the AI tracks what remains to be done. This enables coherent task completion across conversation turns.

---

## 14. Memory Compression Strategy

As conversations grow longer, memory compression becomes essential for maintaining performance. MiniMax implements an automatic compression system that triggers when context approaches capacity limits.

### 14.2 Compression Trigger and Process

Compression activates when conversation length exceeds predefined thresholds. The system monitors token count and initiates compression when approaching model context limits, typically leaving a buffer to ensure complete response generation.

The compression process takes existing messages and generates a condensed summary. This summary preserves essential information while discarding redundant phrasing, intermediate reasoning, and superseded context. The AI itself performs the summarization, leveraging its language understanding capabilities to identify and retain crucial information.

After summarization completes, old messages get deleted from active context. The generated summary replaces the original messages, maintaining continuity while freeing significant token space. This process can repeat multiple times throughout extended conversations.

### 14.3 Compression Artifacts

The compression process produces structured artifacts that maintain information organization. These artifacts include condensed versions of user requests, key decisions made during discussions, important facts discovered or provided, and pending tasks requiring future attention.

The system tracks which information has undergone compression and from which conversation segments. This tracking enables the AI to reference compressed history when needed, though direct access to original messages gets removed to conserve context space.

Compression granularity adapts based on conversation content. Routine exchanges compress more aggressively than discussions involving significant decisions or complex problem-solving. This adaptive approach preserves important context while maintaining efficient token usage.

---

## 15. Routing Strategy

Model selection routing enables MiniMax to optimize for cost, speed, and capability across different task types. Rather than using a single model for all operations, the system routes requests to appropriate models based on task characteristics.

### 15.1 Model Tier Architecture

The routing system implements a three-tier model architecture optimized for different purposes. Each tier serves specific use cases, enabling efficient resource allocation while maintaining high-quality outputs.

The main agent tier uses capable yet cost-effective models for general conversation and task handling. These models balance intelligence with efficiency, providing high-quality responses without excessive token costs. Gemini Flash Lite serves this role in the default configuration.

The subagent tier uses lightweight models for specialized tasks that require focused execution. These models handle research, data extraction, and structured output generation. GPT-5 Nano provides excellent performance for these narrow tasks at minimal cost.

The reasoning tier activates only when complex problem-solving requires advanced capabilities. These situations involve multi-step logic, complex code generation, or nuanced analysis. DeepSeek V3.2 or equivalent reasoning-focused models handle these requests, with usage carefully monitored due to higher costs.

### 15.2 Routing Rules

Automatic routing determines which model handles each request based on detected task type. Simple questions and routine tasks route to the main agent. Tasks requiring specific tools or focused execution route to subagents. Complex reasoning requests that exceed main agent capabilities escalate to the reasoning tier.

User override enables explicit model selection when needed. Users can specify which model should handle particular requests, overriding automatic routing decisions. This capability proves valuable when users understand their specific requirements better than automatic routing.

Cost tracking monitors model usage across all tiers. The system provides visibility into spending patterns, enabling users to adjust routing rules if costs exceed expectations. This transparency ensures budget predictability while maintaining capability flexibility.

---

## 16. Subagent Design

Subagents extend MiniMax's capabilities by handling specialized tasks with focused context and structured outputs. Unlike the main conversational agent, subagents receive minimal context and return results in predefined formats.

### 16.1 Subagent Architecture

Each subagent operates as a specialized worker with clear boundaries. The architecture emphasizes simplicity and predictability, avoiding the complexity that leads to verbose or unfocused outputs.

Task specification provides subagents with clear objectives. Each subagent request includes the task description, relevant context, and expected output format. This structured input prevents ambiguity and ensures focused execution.

Minimal context injection gives subagents only information necessary for the current task. This approach prevents subagents from getting distracted by irrelevant conversation history or unnecessary background. The main agent acts as an intermediary, filtering and preparing context for subagent consumption.

Structured output requirements define exactly what subagents should return. Rather than free-form responses, subagents output JSON with specific fields. This standardization enables reliable parsing and integration with main agent workflows.

### 16.2 Subagent Types

Research subagents handle information gathering and synthesis. They accept research queries, perform web searches or document analysis, and return summaries with key findings. Output includes summary text, relevant sources, and identified gaps requiring further investigation.

Writing subagents produce content in specified formats. They accept drafting requests with style guidelines and target format. Output includes the drafted content, revision suggestions, and identified areas requiring clarification.

Analysis subagents examine data or code for patterns and issues. They accept examination targets and analysis criteria. Output includes findings, risk identification, and recommended actions.

Planning subagents break down complex tasks into executable steps. They accept task descriptions and constraints. Output includes numbered action items, dependencies, estimated effort, and risk factors.

### 16.3 Subagent Output Schema

All subagents return structured JSON conforming to a standard schema. This consistency enables reliable processing regardless of which subagent handles the request.

```json
{
  "summary": "Brief overview of results",
  "action_items": ["item1", "item2"],
  "risks": ["risk1", "risk2"],
  "recommended_next_step": "Description"
}
```

The summary field provides a concise overview suitable for direct inclusion in responses to users. Action items enumerate specific tasks identified or recommended. Risks highlight potential issues or concerns worth noting. The recommended next step suggests logical progression based on results.

---

## 17. Core Tools Implementation

The tool system forms the operational backbone of MiniMax, enabling the AI to interact with the world beyond conversation. Initial implementation focuses on essential tools that deliver immediate value.

### 17.1 Productivity Tools

Notes management tools provide persistent information storage and retrieval. The notes.save tool stores text under specified keys, enabling the AI to remember information across sessions. The notes.search tool queries stored notes by keyword, enabling retrieval of previously saved information.

Task management tools track actionable items. The tasks.add tool creates new tasks with descriptions and optional due dates. The tasks.list tool retrieves pending tasks, enabling the AI to remind users of outstanding work and track project progress.

### 17.2 Research Tools

Web search tools enable information gathering from online sources. The web.search tool accepts queries and returns search results with titles, snippets, and URLs. The web.open tool retrieves and summarizes web page content, enabling deeper research on specific topics.

### 17.3 Utility Tools

Text processing tools handle common transformation needs. The summarize tool condenses lengthy text into brief summaries, useful for compressing tool outputs or user-provided documents. The extract_action_items tool parses meeting notes or discussions to identify actionable tasks.

### 17.4 Tool Execution Model

Tool invocation follows a structured pattern. The AI requests tool execution by specifying tool name and arguments. The Gateway validates the request against security policies, executes the tool, and returns results to the AI. The AI then incorporates results into its response.

Truncation handles excessively long tool outputs. Files, command results, and web content that exceed size limits get summarized rather than passed in full. This prevents context overflow while preserving essential information.

---

## 18. MVP Implementation

The fastest path to a functional MiniMax focuses on three core components. Building these three elements creates a working agent that demonstrates core capabilities.

### 18.1 Main Agent Loop

The main agent loop implements the core conversation cycle. The system receives user messages, passes them to the model with appropriate context, receives model responses, and delivers those responses to users. Tool calling support enables the model to request external actions during this cycle.

The loop handles streaming responses for improved perceived responsiveness. Rather than waiting for complete model outputs, the system streams tokens as they generate. This approach makes the agent feel more responsive, especially for longer responses.

Logging captures all interactions for debugging and improvement. Message logs record user inputs, model outputs, and tool invocations. These logs enable troubleshooting issues and understanding agent behavior.

### 18.2 Web Search Tool

The web search tool provides immediate value by enabling the agent to answer questions requiring current information. Implementation uses a search API to query web results, then presents summaries to the model for incorporation into responses.

The tool accepts query strings and returns structured results. Each result includes title, URL, and snippet. The model uses these results to construct accurate, current responses.

Rate limiting prevents excessive API calls. The system tracks usage and can enforce limits based on configuration or budget constraints.

### 18.3 Memory Compression

Memory compression enables the system to handle extended conversations without context overflow. The compression system monitors conversation length, triggers summarization when needed, and manages the transition from full history to compressed summary.

Implementing compression requires tracking message tokens, generating summaries that preserve essential context, and updating the conversation state with compressed history. This creates a sustainable loop for long-running conversations.

### 18.4 MVP Success Criteria

A successful MVP demonstrates several key capabilities. The agent responds to messages through at least one channel. Tool usage works for web search and basic operations. Memory compression enables extended conversations without degradation. The system operates reliably without manual intervention.

Once these three components function together, the foundation exists for adding additional channels, tools, and advanced features. Users experience a working agent that improves through iteration.

---

## 19. What Makes MiniMax Feel Intelligent

The perception of intelligence comes not from the underlying model alone but from the workflow patterns that govern how the agent operates. MiniMax implements specific behavioral patterns that create the "agentic effect" users experience with advanced AI assistants.

### 19.1 The Plan-Execute-Evaluate Loop

Intelligent behavior emerges from systematic workflow. Rather than generating single responses to prompts, the agent engages in iterative cycles of planning, execution, evaluation, and refinement. When given complex tasks, the agent breaks them into steps, executes each step, evaluates results, and adjusts approach based on outcomes.

This loop transforms the agent from a reactive responder into an active problem-solver. Users observe the agent exploring options, trying approaches, and improving upon initial attempts. The conversation becomes a collaboration rather than a simple query-response exchange.

### 19.2 Delegation Patterns

Complex tasks delegate to specialized subagents that handle focused execution. The main agent coordinates these subagents, aggregating their results into coherent responses. This delegation enables parallel processing of independent tasks and specialized handling of complex requirements.

Subagent results flow back to the main agent, which synthesizes outputs and presents unified responses to users. The coordination layer manages subagent lifecycle, handles errors, and ensures results integrate properly.

### 19.3 Iterative Refinement

Initial outputs undergo refinement based on evaluation. The agent doesn't simply generate responses and consider them complete. Instead, it critically examines outputs, identifies weaknesses, and improves upon them. This self-correction creates higher quality results than single-pass generation.

Users observe this refinement as the agent "thinks through" problems, considers alternatives, and arrives at better solutions. The transparency of this process builds trust and demonstrates genuine problem-solving capability.

### 19.4 Proactive Assistance

Beyond reactive responses, the agent anticipates needs and offers relevant assistance. When the agent identifies related tasks or potential issues, it surfaces these proactively rather than waiting for user queries. This proactivity demonstrates understanding beyond literal request parsing.

---

## 20. Implementation Roadmap

Building MiniMax follows a deliberate practice plan that establishes capabilities incrementally while maintaining a working system throughout development.

### 20.1 Week One: Core Agent Loop

The first week establishes the fundamental agent architecture. Implementation focuses on creating the main agent loop with model calling support, tool invocation handling, and response streaming. Logging provides visibility into system behavior for debugging.

Key deliverables include a working message loop that accepts input, calls the model, and returns responses. Tool calling support enables the model to request external actions. Basic logging captures all interactions for analysis.

### 20.2 Week Two: Memory Compression

The second week adds memory management capabilities. Implementation creates the compression system that monitors conversation length, generates summaries, and manages context transitions. This enables extended conversations without performance degradation.

Key deliverables include token counting and threshold monitoring. Summary generation preserves essential context. State management handles compression transitions smoothly.

### 20.3 Week Three: Subagents ✅ COMPLETE

**Status:** ✅ Fully implemented in v0.3.1

The third week implements subagent architecture. Research, writing, and analysis subagents handle specialized tasks. Structured output schemas enable reliable result parsing. Integration with the main agent creates coordinated workflows.

**Implemented:**
- ✅ 5 subagent types (research, writer, planner, critic, summarizer)
- ✅ SubagentRegistry for management
- ✅ Structured JSON output parsing
- ✅ delegate_to_subagent tool
- ✅ Configurable model selection
- ✅ 97% cost savings using gpt-4o-mini
- ✅ 19 tests (100% passing)

### 20.4 Week Four: Routing and Budget Mode ✅ COMPLETE

**Status:** ✅ Fully implemented in v0.2.x

The fourth week completes the core architecture with model routing and cost management. Default routing assigns appropriate models based on task type. Budget mode enables cost control through lightweight model usage. Monitoring provides visibility into spending patterns.

**Implemented:**
- ✅ ModelRouter with multi-provider support
- ✅ Automatic fallback system
- ✅ Cost-based routing (cheapest first)
- ✅ Subagent delegation for cost optimization
- ✅ Token usage tracking

Completing these four weeks establishes a functional agent system with capabilities comparable to OpenClaw's core functionality. Subsequent development can focus on additional channels, tools, and advanced features.

---

## 📊 Implementation Progress

### ✅ Completed Features (v0.3.1)

| Feature | Status | Details |
|---------|--------|---------|
| **Core Agent Loop** | ✅ | State machine, tool calling, memory |
| **Multi-Provider** | ✅ | DeepSeek, OpenRouter, OpenAI |
| **Memory System** | ✅ | Compression, context management |
| **Multi-Channel** | ✅ | CLI, TUI, Telegram, WhatsApp |
| **File Tools** | ✅ | Read, write, list, search |
| **Shell Tools** | ✅ | Command execution with safety |
| **Web Tools** | ✅ | Search (4 providers), fetch |
| **Browser Tools** | ✅ | 5 Puppeteer tools (100% tested) |
| **Subagent System** | ✅ | 5 agents, 97% cost savings |
| **Productivity Tools** | ✅ | Notes, tasks (5 local tools) |
| **Apple Integrations** | ✅ | 8 tools (Notes, Reminders, Calendar) |
| **Shadow Loop** | ✅ | Proactive intelligence (85.8% coverage) |
| **Service Management** | ✅ | LaunchAgent/systemd support |
| **Config Hot Reload** | ✅ | Auto-reload on changes |
| **Health Checks** | ✅ | Basic, deep, ready endpoints |

### ❌ Missing Features

| Feature | Priority | Complexity |
|---------|----------|------------|
| Discord Channel | P2 | Medium |
| WebChat UI | P2 | High |
| OS Tools | P2 | Low |
| Vector/SQLite | P3 | High |
| Mobile Apps | P3 | Very High |
| Voice Features | P3 | High |

### 📈 Progress Summary

- **v0.2.x**: 70% complete (foundation + routing)
- **v0.3.1**: 85% complete (Shadow Loop, Browser, Subagents, Productivity)
- **v1.0**: 100% (all planned features)

**Current Stats:**
- 70 source files
- 26+ tools
- 5 subagents
- 8 Apple integrations
- 323 tests (100% passing)
- 3 channels

---

## 21. Conclusion

MiniMax represents an ambitious vision for personal AI assistance that prioritizes user privacy, local control, and deep system integration. By drawing inspiration from OpenClaw's innovative approach while charting its own architectural path, MiniMax aims to deliver a uniquely capable assistant that operates entirely on user infrastructure.

The technical design presented in this document provides a roadmap for implementation while maintaining flexibility for adaptation as the project evolves. Core architectural decisions around the Gateway model, security-first design, memory strategy, and extension capabilities establish a foundation for future growth.

The memory strategy distinguishes MiniMax from comparable systems. Never sending full chat history, implementing automatic compression, and maintaining structured memory summaries enables efficient operation while preserving conversational continuity. This approach delivers better user experience while controlling costs.

**Implementation Status:** With v0.3.1, MiniMax has achieved 85% of planned features. The four-week roadmap is complete, with Shadow Loop, browser automation, subagent system, and productivity tools fully implemented. Remaining work focuses on additional channels (Discord), UI (WebChat), and advanced features (Vector/SQLite, mobile apps).

The result is a personal AI assistant that truly works for the user, on the user's machine, under the user's control.
