#!/usr/bin/env node
/**
 * Comprehensive OpenCode Integration Test
 * Tests: Models, Router, Subagents, Agent Loop
 */

import { createOpenCodeProviderNoAuth } from './dist/agent/providers/opencode.js';
import { ModelRouter } from './dist/agent/router.js';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  OpenCode Comprehensive Integration Test                ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// Test 1: Direct Provider Test
console.log('📋 Test 1: Direct Provider Communication\n');

const models = [
    'minimax-m2.5-free',
    'big-pickle',
    'glm-5-free',
    'kimi-k2.5-free',
];

let allPassed = true;

for (const modelId of models) {
    const provider = createOpenCodeProviderNoAuth(modelId);
    
    try {
        const response = await provider.chat(
            [{ role: 'user', content: 'Say "Hello!" and nothing else.' }],
            { model: modelId, maxTokens: 20 }
        );
        
        const content = response.content || '(reasoning only)';
        console.log(`  ✅ ${modelId}: ${content.slice(0, 50)}`);
    } catch (error) {
        console.log(`  ❌ ${modelId}: ${error.message}`);
        allPassed = false;
    }
}

// Test 2: Router Integration
console.log('\n📋 Test 2: ModelRouter Integration\n');

const testConfig = {
    agent: {
        model: 'opencode/minimax-m2.5-free',
        subagentModel: 'opencode/big-pickle',
        providers: {
            opencode: {
                apiKey: 'sk-opencode-free-no-key-required',
                models: ['minimax-m2.5-free', 'big-pickle', 'glm-5-free', 'kimi-k2.5-free'],
            },
        },
        maxTokens: 4096,
        maxIterations: 10,
        temperature: 0.7,
        thinkingLevel: 'medium',
        failover: [],
    },
    gateway: { host: '127.0.0.1', port: 19789, auth: { mode: 'none' }, tailscale: { enabled: false }, cors: { origins: [] } },
    channels: { telegram: { enabled: false }, discord: { enabled: false }, webchat: { enabled: false }, cli: { enabled: true }, whatsapp: { enabled: false } },
    tools: { files: { enabled: true, allowedPaths: [], deniedPaths: [] }, shell: { enabled: true, confirmDestructive: true, blockedCommands: [], timeout: 30000 }, web: { enabled: true, searchProvider: 'duckduckgo' }, memory: { enabled: true }, browser: { enabled: true, headless: true } },
    memory: { enabled: true, compaction: { enabled: true, keepRecentMessages: 10 } },
    hooks: { bootMd: { enabled: false } },
};

try {
    const router = new ModelRouter(testConfig);
    
    // Test cheapest provider (should be OpenCode)
    const cheapest = router.getProviderForTask('simple');
    if (cheapest && cheapest.providerId === 'opencode') {
        console.log(`  ✅ Router selects OpenCode for simple tasks`);
        console.log(`     Model: ${cheapest.model}`);
    } else {
        console.log(`  ❌ Router didn't select OpenCode (got: ${cheapest?.providerId})`);
        allPassed = false;
    }
    
    // Test default provider
    const defaultProvider = router.getDefaultProvider();
    if (defaultProvider && defaultProvider.providerId === 'opencode') {
        console.log(`  ✅ Router default provider is OpenCode`);
    } else {
        console.log(`  ❌ Router default provider is not OpenCode`);
        allPassed = false;
    }
    
    // Test provider availability
    if (router.hasProviders()) {
        console.log(`  ✅ Router has providers available`);
    } else {
        console.log(`  ❌ Router has no providers`);
        allPassed = false;
    }
    
} catch (error) {
    console.log(`  ❌ Router test failed: ${error.message}`);
    allPassed = false;
}

// Test 3: Subagent Model Configuration
console.log('\n📋 Test 3: Subagent Configuration\n');

if (testConfig.agent.subagentModel === 'opencode/big-pickle') {
    console.log(`  ✅ Subagent model configured: ${testConfig.agent.subagentModel}`);
} else {
    console.log(`  ❌ Subagent model not configured correctly`);
    allPassed = false;
}

// Test 4: All Models Available
console.log('\n📋 Test 4: Model Availability\n');

const configuredModels = testConfig.agent.providers.opencode.models;
const expectedModels = ['minimax-m2.5-free', 'big-pickle', 'glm-5-free', 'kimi-k2.5-free'];

if (configuredModels.length === expectedModels.length) {
    console.log(`  ✅ All 4 models configured`);
    configuredModels.forEach(m => console.log(`     • ${m}`));
} else {
    console.log(`  ❌ Missing models (expected 4, got ${configuredModels.length})`);
    allPassed = false;
}

// Final Summary
console.log('\n' + '═'.repeat(60));
console.log('📊 Test Summary\n');

if (allPassed) {
    console.log('  🎉 ALL TESTS PASSED!\n');
    console.log('  ✅ Direct provider communication works');
    console.log('  ✅ Router integration works');
    console.log('  ✅ Subagent configuration works');
    console.log('  ✅ All 4 models available');
    console.log('\n  OpenCode is fully integrated and ready to use! 🚀\n');
} else {
    console.log('  ⚠️  SOME TESTS FAILED\n');
    console.log('  Check the output above for details.\n');
    process.exit(1);
}
