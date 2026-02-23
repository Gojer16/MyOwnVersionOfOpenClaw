# Talon Sub-agent Management System

## Purpose
Specialized AI agents for cost-effective task delegation, enabling the main agent to offload specialized work to cheaper models while maintaining quality. This system achieves 97% cost savings by routing appropriate tasks to optimized subagents instead of expensive primary models.

## Scope Boundaries
- **IN SCOPE**: 5 specialized subagent types (research, writer, planner, critic, summarizer), registry-based delegation, subagent lifecycle management, task routing
- **OUT OF SCOPE**: Primary agent reasoning, tool execution, memory management, user interaction, channel communication
- **BOUNDARIES**: Subagents receive tasks from main agent via registry, execute specialized work, return structured results. No direct user interaction or tool access.

## Architecture Overview
```
Main Agent → SubagentRegistry → [Research|Writer|Planner|Critic|Summarizer]Subagent → ModelRouter → LLM Provider
    ↑                                    ↓
Task Delegation                    Structured Result
```

**Core Design**: Factory pattern with abstract `Subagent` base class. Each concrete subagent implements specialized prompt engineering for its domain. Registry provides type-safe lookup and execution.

**Key Components**:
1. `Subagent` (abstract base class) - Defines interface for all subagents
2. `SubagentRegistry` - Central registry for subagent lookup and execution
3. 5 concrete implementations - Specialized for specific task types
4. `ModelRouter` integration - Routes subagent requests to appropriate LLM providers

## Folder Structure Explanation
```
subagents/
├── index.ts              # Public exports (types, base, registry, all subagents)
├── types.ts              # TypeScript interfaces (SubagentType, SubagentTask, SubagentResult)
├── base.ts               # Abstract Subagent base class
├── registry.ts           # SubagentRegistry for centralized management
├── research.ts           # ResearchSubagent - information gathering and analysis
├── writer.ts             # WriterSubagent - content creation and editing
├── planner.ts            # PlannerSubagent - task planning and scheduling
├── critic.ts             # CriticSubagent - quality review and feedback
└── summarizer.ts         # SummarizerSubagent - content condensation
```

**File Roles**:
- `base.ts:3-10` - Abstract class defining subagent contract
- `registry.ts:4-22` - Central registry with type-safe execution
- Each concrete subagent implements specialized prompt templates and result parsing

## Public API
```typescript
// Types
type SubagentType = 'research' | 'writer' | 'planner' | 'critic' | 'summarizer';
interface SubagentTask { type: SubagentType; description: string; context?: Record<string, any>; }
interface SubagentResult { summary: string; data: any; confidence: number; metadata?: Record<string, any>; }

// Classes
abstract class Subagent { constructor(type: SubagentType, model: string); abstract execute(task: SubagentTask): Promise<SubagentResult>; }
class SubagentRegistry { register(type: SubagentType, subagent: Subagent): void; get(type: SubagentType): Subagent | undefined; execute(task: SubagentTask): Promise<SubagentResult>; }

// Concrete implementations (exported via index.ts)
class ResearchSubagent extends Subagent { constructor(model: string, router: ModelRouter); async execute(task: SubagentTask): Promise<SubagentResult>; }
class WriterSubagent extends Subagent { constructor(model: string, router: ModelRouter); async execute(task: SubagentTask): Promise<SubagentResult>; }
class PlannerSubagent extends Subagent { constructor(model: string, router: ModelRouter); async execute(task: SubagentTask): Promise<SubagentResult>; }
class CriticSubagent extends Subagent { constructor(model: string, router: ModelRouter); async execute(task: SubagentTask): Promise<SubagentResult>; }
class SummarizerSubagent extends Subagent { constructor(model: string, router: ModelRouter); async execute(task: SubagentTask): Promise<SubagentResult>; }
```

**Usage Pattern**:
```typescript
import { SubagentRegistry, ResearchSubagent, WriterSubagent } from './subagents/index.js';
import { ModelRouter } from '../agent/router.js';

const registry = new SubagentRegistry();
const router = new ModelRouter();
registry.register('research', new ResearchSubagent('gpt-3.5-turbo', router));
registry.register('writer', new WriterSubagent('gpt-3.5-turbo', router));

const result = await registry.execute({ type: 'research', description: 'Research AI ethics guidelines' });
```

## Internal Logic Details
**Subagent Execution Flow** (`research.ts:11-25`):
1. Receive `SubagentTask` with type and description
2. Build specialized prompt using `buildSubAgentPrompt()` from agent prompts
3. Route to default provider via `ModelRouter`
4. Parse LLM response as JSON
5. Return structured `SubagentResult` with summary, data, and confidence

**Prompt Engineering**: Each subagent uses domain-specific prompt templates defined in `agent/prompts.ts:266-332`. Research subagent focuses on information gathering, writer on content creation, planner on task breakdown, critic on quality assessment, summarizer on condensation.

**Registry Management** (`registry.ts:7-21`):
- Type-safe registration with `Map<SubagentType, Subagent>`
- Centralized execution with error handling for missing subagents
- Singleton pattern (typically one registry per agent instance)

**Cost Optimization**: Subagents use cheaper models (gpt-3.5-turbo vs gpt-4) for specialized tasks where quality degradation is acceptable. Main agent decides when to delegate based on task complexity and cost-benefit analysis.

## Data Contracts
**Input** (`types.ts:3-7`):
```typescript
interface SubagentTask {
    type: SubagentType;           // Required: which subagent to use
    description: string;          // Required: task description
    context?: Record<string, any>; // Optional: additional context
}
```

**Output** (`types.ts:9-14`):
```typescript
interface SubagentResult {
    summary: string;              // Human-readable summary of results
    data: any;                    // Structured data (subagent-specific)
    confidence: number;           // 0-1 confidence score
    metadata?: Record<string, any>; // Optional: execution metadata
}
```

**Subagent-Specific Data Formats**:
- Research: `{ findings: Array<{source: string, content: string}>, keyInsights: string[] }`
- Writer: `{ content: string, style: string, wordCount: number }`
- Planner: `{ steps: Array<{task: string, dependencies: string[]}>, timeline: string }`
- Critic: `{ feedback: string[], score: number, improvements: string[] }`
- Summarizer: `{ summary: string, keyPoints: string[], lengthReduction: number }`

## Failure Modes
1. **Missing Subagent** (`registry.ts:17-19`): Throws `Error("Subagent not found: ${task.type}")` when registry lacks requested subagent type.

2. **Provider Unavailable** (`research.ts:14`): Throws `Error("No provider available")` when `ModelRouter` has no default provider.

3. **JSON Parse Failure** (`research.ts:18`): Unhandled `JSON.parse()` exception when LLM returns invalid JSON. Missing: Error handling for malformed responses.

4. **LLM Timeout/Error**: Unhandled async rejection when provider.chat() fails. Missing: Retry logic and fallback mechanisms.

5. **Low Confidence Results**: Subagents return confidence scores but no validation against thresholds. Missing: Confidence-based result filtering.

**Recovery Strategies**:
- Registry should validate subagent existence before execution
- Add try-catch around JSON parsing with fallback to raw text
- Implement provider fallback chain in ModelRouter
- Add confidence threshold validation in main agent

## Observability
**Current State**: Minimal observability. Missing: Logging, metrics, tracing.

**Required Enhancements**:
1. **Logging**: Execution start/end, provider used, response time, confidence scores
2. **Metrics**: Subagent invocation counts, success/failure rates, average confidence, cost tracking
3. **Tracing**: Correlation IDs for subagent execution chains, prompt/response sampling
4. **Health Checks**: Subagent availability, provider connectivity, response validation

**Debug Information**: Each subagent execution should log: `{ subagentType, taskDescription, modelUsed, responseTimeMs, confidence, dataShape }`

## AI Agent Instructions
**When to Use Subagents**:
- **DELEGATE**: Research tasks, content writing, project planning, quality review, summarization
- **DO NOT DELEGATE**: Critical reasoning, tool execution, user interaction, sensitive decisions

**Prompt Engineering Notes**:
- Each subagent has specialized prompt templates in `agent/prompts.ts`
- Research: Focus on factual accuracy and source attribution
- Writer: Emphasize style consistency and audience appropriateness
- Planner: Require dependency analysis and timeline estimation
- Critic: Balance constructive feedback with actionable improvements
- Summarizer: Preserve key information while reducing length

**Cost Optimization Guidance**:
- Use gpt-3.5-turbo for all subagent tasks (97% cheaper than gpt-4)
- Monitor subagent usage vs main agent usage ratio (target: >30% delegation)
- Validate subagent results meet confidence thresholds before accepting

**Integration Points**:
- Main agent calls `setSubagentRegistry()` in `agent/loop.ts:68-70`
- Subagents use `ModelRouter` from agent system for LLM access
- Results flow back to main agent for integration with overall task execution

## Extension Points
1. **New Subagent Types**: Extend `SubagentType` enum, create new class extending `Subagent`, register in registry.

2. **Custom Prompt Templates**: Override `buildSubAgentPrompt()` usage with custom prompt engineering.

3. **Result Validation**: Add post-processors to validate and enhance subagent results before returning.

4. **Provider Selection**: Extend subagent constructors to accept custom provider selection logic.

5. **Caching Layer**: Add result caching for identical tasks to reduce LLM calls.

**Hook System** (Missing): No lifecycle hooks for pre/post execution. Suggested: `beforeExecute(task): Promise<void>` and `afterExecute(result): Promise<void>`.

**Plugin Architecture**: Subagents could be loaded dynamically as plugins with configuration-based registration.

## Technical Debt & TODO
**HIGH PRIORITY**:
1. **Error Handling**: Add try-catch around JSON parsing and LLM calls with graceful fallbacks
2. **Observability**: Implement logging, metrics, and tracing for subagent execution
3. **Validation**: Add schema validation for subagent results using Zod
4. **Testing**: Unit tests for all subagent types and registry operations

**MEDIUM PRIORITY**:
5. **Caching**: Implement result caching with TTL for identical tasks
6. **Retry Logic**: Add exponential backoff for failed LLM calls
7. **Configuration**: Make models configurable per subagent type
8. **Health Checks**: Add subagent health monitoring and automatic recovery

**LOW PRIORITY**:
9. **Batch Processing**: Support batch execution of similar tasks
10. **Quality Metrics**: Track subagent output quality over time
11. **A/B Testing**: Compare different models/prompts for each subagent type
12. **Dynamic Registration**: Allow runtime subagent registration/unregistration

**ARCHITECTURAL DEBT**:
- Tight coupling to `ModelRouter` - consider dependency injection
- No interface for `ModelRouter` - using concrete type
- Missing abstraction for prompt template management
- Hardcoded confidence scores (0.8) - should be calculated based on response quality

**SECURITY NOTES**: Subagents execute arbitrary LLM prompts. Ensure prompt injection protection and output sanitization for user-facing content.