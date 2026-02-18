#!/usr/bin/env node
/**
 * Test OpenCode integration with Talon
 */

import { createOpenCodeProviderNoAuth } from './dist/agent/providers/opencode.js';

const models = [
    'minimax-m2.5-free',
    'big-pickle',
    'glm-5-free',
    'kimi-k2.5-free',
];

async function testModel(modelId) {
    console.log(`\n🧪 Testing ${modelId}...`);
    
    const provider = createOpenCodeProviderNoAuth(modelId);
    
    try {
        const response = await provider.chat(
            [{ role: 'user', content: `Say "Hello from ${modelId}" and nothing else.` }],
            { model: modelId, maxTokens: 50 }
        );
        
        console.log(`  ✅ Success: ${response.content?.slice(0, 100) || '(empty)'}`);
        console.log(`  📊 Tokens: ${response.usage?.totalTokens || 'N/A'}`);
        return true;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  OpenCode Integration Test             ║');
    console.log('║  (No Authorization Header)             ║');
    console.log('╚════════════════════════════════════════╝');
    
    const results = [];
    
    for (const model of models) {
        const success = await testModel(model);
        results.push({ model, success });
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Results Summary:');
    console.log('═'.repeat(50));
    
    const passed = results.filter(r => r.success).length;
    const total = results.length;
    
    results.forEach(({ model, success }) => {
        console.log(`  ${success ? '✅' : '❌'} ${model}`);
    });
    
    console.log('\n' + `${passed}/${total} models working`);
    
    if (passed === total) {
        console.log('\n🎉 All OpenCode models integrated successfully!\n');
    } else {
        console.log('\n⚠️  Some models failed - check rate limits or availability\n');
    }
}

runTests().catch(console.error);
