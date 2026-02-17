# Test Suite

## Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## Test Coverage

### ✅ Passing Tests (18/39)
- Memory Manager (7/7)
- Event Bus (6/6)
- Config Schema (4/5)

### ❌ Failing Tests (21/39)
- Context Guard (0/8) - Static methods not exported
- Session Manager (1/13) - Requires config object

## Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── config-schema.test.ts
│   ├── context-guard.test.ts
│   ├── event-bus.test.ts
│   ├── memory-manager.test.ts
│   └── session-manager.test.ts
└── integration/             # Integration tests (TODO)
```

## Known Issues

1. **Context Guard** - Methods are not static, need instance
2. **Session Manager** - Requires TalonConfig in constructor
3. **Config Schema** - One validation test needs adjustment

## Next Steps

- [ ] Fix Context Guard tests (use instance methods)
- [ ] Fix Session Manager tests (provide mock config)
- [ ] Add integration tests
- [ ] Add coverage reporting
- [ ] Add CI/CD pipeline
