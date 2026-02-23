# 📚 Talon Documentation Guide

## 🎯 Purpose
This guide explains how to maintain and improve documentation for the Talon AI Assistant project. Every folder now has a `README.md` template that needs to be filled with actual content.

## 📁 Documentation Structure
```
PersonalOpenClawVersion/
├── DOCUMENTATION_GUIDE.md          ← You are here
├── generate-readmes.py             ← Auto-generates README templates
├── src/
│   ├── README.md                   ← Root overview (COMPLETE)
│   ├── agent/README.md             ← AI Agent System (COMPLETE)
│   ├── agent/providers/README.md   ← AI Providers (COMPLETE)
│   ├── memory/README.md            ← Memory System (COMPLETE)
│   ├── [26 other folders]/README.md ← NEEDS CONTENT
│   └── ...
└── package.json                    ← Project info
```

## ✅ Completed Documentation
1. **`src/README.md`** - Root overview ✓
2. **`src/agent/README.md`** - AI Agent System ✓  
3. **`src/agent/providers/README.md`** - AI Providers ✓
4. **`src/memory/README.md`** - Memory System ✓

## 📋 What Each README Should Contain

### 1. **What This Folder Does** (1-2 sentences)
- Clear purpose statement
- How it fits in the overall system
- Example: "Manages AI agent memory with compression and search"

### 2. **Key Files** (List with descriptions)
- File names with `.ts`/`.js` extensions
- Brief description of each file's purpose
- Line counts for large files (optional)
- Example: "`loop.ts` - Main agent state machine (21592 lines)"

### 3. **Important Constraints** (Bullet points)
- Technical limitations
- Rate limits, API constraints
- Performance considerations
- Example: "Max 3 API calls per minute to avoid rate limiting"

### 4. **Public Interfaces** (Functions/classes)
- Exported functions and classes
- Their purposes and parameters
- Example: "`MemoryManager` class - Controls context sent to LLM"

### 5. **Integration Points** (Connections to other modules)
- What this module depends on
- What depends on this module
- Example: "Used by `AgentLoop` for LLM context building"

### 6. **Common Issues & Fixes** (Troubleshooting)
- Known problems and solutions
- Error messages and fixes
- Performance optimization tips

## 🚀 Quick Fill Template
For each `README.md`, replace these placeholders:

```markdown
# 📁 [folder-name]/ - [Purpose]

## 🎯 What This Folder Does
[Brief description of what this module does within Talon AI Assistant]

## 📄 Key Files
- `[filename].ts` - ([line count] lines) [Description]
- `[filename].js` - [Description]

## ⚠️ Important Constraints
- [Add important technical constraints or requirements]
- [Add rate limits, API constraints, etc.]

## 🔌 Public Interfaces
- `[ClassNameOrFunction]` - [Purpose]

## 🔄 Integration Points
- **Connected to**: [Other modules this interacts with]
- **Used by**: [Who consumes this module]

## 🚨 Common Issues & Fixes
1. **[Common error]**: [Solution]
2. **[Performance issue]**: [Optimization]

## 📚 Related Documentation
- See `../README.md` for parent module overview
```

## 🎯 Priority Folders to Document First

### **High Priority** (Core System)
1. `src/cli/` - Command-line interface
2. `src/gateway/` - Main server
3. `src/tools/` - Tool implementations
4. `src/utils/` - Utility functions

### **Medium Priority** (Important Modules)
5. `src/plugins/` - Plugin system
6. `src/protocol/` - Communication protocols
7. `src/storage/` - Data persistence
8. `src/types/` - TypeScript types

### **Lower Priority** (Specialized)
9. `src/subagents/` - Sub-agent management
10. `src/shadow/` - Shadow execution
11. `src/channels/` - Communication channels
12. `src/skills/` - Skill system

## 🔧 Tools for Documentation

### 1. **Line Count Script**
```bash
# Count lines in TypeScript files
find src/cli -name "*.ts" -exec wc -l {} + | sort -nr
```

### 2. **File Analysis**
```bash
# List all files in a folder with sizes
ls -la src/cli/ | grep -E "\.(ts|js|json)$"
```

### 3. **Check Dependencies**
```bash
# Find imports in TypeScript files
grep -r "import.*from" src/cli/ --include="*.ts" | head -10
```

## 📝 Documentation Best Practices

### ✅ **DO**
- Keep descriptions concise (1-2 sentences per item)
- Include actual line counts for large files
- List real constraints (API limits, performance issues)
- Link to related documentation
- Update when code changes significantly

### ❌ **DON'T**
- Write novels (keep under 2 pages)
- Include implementation details (that's what code comments are for)
- Document private/internal functions
- Forget to update when APIs change

## 🎨 Example: Good vs Bad Documentation

### ❌ **Bad** (Too vague)
```
# Tools Folder
This folder has tools. Use them carefully.
```

### ✅ **Good** (Specific and useful)
```
# 📁 tools/ - Tool Definitions and Implementations

## 🎯 What This Folder Does
Defines and implements tools that AI agents can use, including file operations, web search, and system commands.

## 📄 Key Files
- `file-tools.ts` - File system operations (read, write, edit)
- `web-tools.ts` - Web search and fetch utilities (3421 lines)
- `system-tools.ts` - System command execution (2897 lines)

## ⚠️ Important Constraints
- File tools require proper permissions (read/write)
- Web tools have rate limits (10 requests/minute)
- System tools run in sandboxed environment

## 🔌 Public Interfaces
- `registerTool()` - Register new tool with agent system
- `executeTool()` - Execute tool with parameters
- `ToolRegistry` - Manages available tools

## 🔄 Integration Points
- **Used by**: `AgentLoop` for tool execution
- **Depends on**: `utils/logger.ts` for error logging
```

## 🔄 Maintenance Workflow

1. **When adding new files**: Update the `Key Files` section
2. **When changing APIs**: Update `Public Interfaces` section  
3. **When discovering bugs**: Add to `Common Issues & Fixes`
4. **Monthly review**: Check all READMEs for accuracy

## 🏁 Next Steps

1. **Start with high-priority folders** (cli/, gateway/, tools/)
2. **Examine actual file contents** to write accurate descriptions
3. **Test documentation** by having someone new read it
4. **Create cross-references** between related modules

## 📞 Need Help?
- Check existing complete READMEs for examples
- Use `generate-readmes.py` to recreate templates if needed
- Ask for review of your documentation