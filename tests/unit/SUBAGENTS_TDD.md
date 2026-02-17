# Subagent System - TDD Implementation Guide

## Status: 🔴 Tests Written, Implementation Needed

**Tests:** ✅ 19 tests written in `tests/unit/subagents.test.ts`  
**Implementation:** ❌ Not yet implemented

---

## TDD Process

### Phase 1: ✅ RED - Tests Written (Current)

Tests define the API and expected behavior:

```typescript
// What we expect to exist:
- SubagentRegistry - manages subagent instances
- Subagent types: research, writer, planner, critic, summarizer
- SubagentResult - structured output format
- execute() - runs subagent with task
```

**Test Coverage:**
- Registry management (3 tests)
- Research subagent (2 tests)
- Writer subagent (2 tests)
- Planner subagent (2 tests)
- Critic subagent (1 test)
- Summarizer subagent (2 tests)
- Execution flow (3 tests)
- Model selection (2 tests)
- Error handling (2 tests)

**Total: 19 tests**

---

### Phase 2: 🟢 GREEN - Implementation (Next)

Create these files to make tests pass:

```
src/subagents/
├── index.ts              # SubagentRegistry
├── base.ts               # Base Subagent class
├── research.ts           # Research subagent
├── writer.ts             # Writer subagent
├── planner.ts            # Planner subagent
├── critic.ts             # Critic subagent
└── summarizer.ts         # Summarizer subagent
```

**Implementation Checklist:**

```typescript
// src/subagents/index.ts
export class SubagentRegistry {
    register(type: SubagentType, subagent: Subagent): void
    get(type: SubagentType): Subagent | undefined
    execute(task: SubagentTask): Promise<SubagentResult>
}

// src/subagents/base.ts
export abstract class Subagent {
    constructor(type: SubagentType, model: string)
    abstract execute(task: SubagentTask): Promise<SubagentResult>
}

// src/subagents/research.ts
export class ResearchSubagent extends Subagent {
    async execute(task: SubagentTask): Promise<SubagentResult> {
        // 1. Use web_search tool
        // 2. Extract findings
        // 3. Return structured result with sources
    }
}

// Similar for writer, planner, critic, summarizer
```

---

### Phase 3: 🔵 REFACTOR - Optimize (Later)

After tests pass:
- Extract common patterns
- Optimize model calls
- Add caching
- Improve error handling

---

## Expected API

### SubagentTask

```typescript
interface SubagentTask {
    type: 'research' | 'writer' | 'planner' | 'critic' | 'summarizer';
    description: string;
    context?: Record<string, any>;
}
```

### SubagentResult

```typescript
interface SubagentResult {
    summary: string;           // Brief description
    data: any;                 // Type-specific structured data
    confidence: number;        // 0-1 confidence score
    metadata?: Record<string, any>;
}
```

### Result Data Formats

**Research:**
```typescript
{
    findings: Array<{ title: string; content: string }>;
    sources: string[];
}
```

**Writer:**
```typescript
{
    content: string;
    format: 'markdown' | 'code' | 'text';
    wordCount: number;
}
```

**Planner:**
```typescript
{
    goal: string;
    steps: Array<{ order: number; action: string; details: string }>;
    estimatedTime: string;
    risks: string[];
}
```

**Critic:**
```typescript
{
    rating: number;           // 1-10
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    approved: boolean;
}
```

**Summarizer:**
```typescript
{
    summary: string;
    keyPoints: string[];
    originalLength: number;
    summaryLength: number;
}
```

---

## Usage Example (After Implementation)

```typescript
import { SubagentRegistry } from '@/subagents';
import { ResearchSubagent } from '@/subagents/research';

// Setup
const registry = new SubagentRegistry();
registry.register('research', new ResearchSubagent('gpt-4o-mini'));

// Execute
const result = await registry.execute({
    type: 'research',
    description: 'Research TypeScript benefits',
});

console.log(result.summary);
// "TypeScript is a typed superset of JavaScript"

console.log(result.data.findings);
// [{ title: 'Type Safety', content: '...' }, ...]
```

---

## Integration with Agent Loop

After implementation, integrate with main agent:

```typescript
// In src/agent/loop.ts
import { SubagentRegistry } from '@/subagents';

class AgentLoop {
    private subagents: SubagentRegistry;
    
    async handleComplexTask(task: string) {
        // Detect if task needs subagent
        if (needsResearch(task)) {
            const result = await this.subagents.execute({
                type: 'research',
                description: task,
            });
            
            // Use result in main agent response
            return this.synthesizeResponse(result);
        }
    }
}
```

---

## Cost Optimization

Subagents use cheap models:
- **Main agent:** gpt-4o ($5/1M tokens)
- **Subagents:** gpt-4o-mini ($0.15/1M tokens)

**Savings:** 97% cost reduction for delegated tasks!

---

## Next Steps

1. Run tests: `npm test tests/unit/subagents.test.ts`
2. See them pass (they use mocks currently)
3. Implement `src/subagents/` to make them work with real LLM calls
4. Run tests again - should still pass
5. Integrate with agent loop
6. Commit: "Implement subagent system (TDD)"

---

**Ready to implement?** Start with `src/subagents/base.ts` and `src/subagents/index.ts`! 🚀
