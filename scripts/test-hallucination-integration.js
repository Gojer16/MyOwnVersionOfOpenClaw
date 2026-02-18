#!/usr/bin/env node
/**
 * Integration Test: Simulate the actual hallucination bug scenario
 * 
 * Scenario:
 * 1. User says "Hello" → Agent says "I don't know you"
 * 2. User says "I'm Orlando" → Agent should NOT say "I already know you from previous sessions"
 * 
 * This test verifies the system prompt contains the right instructions to prevent this.
 */

import { buildSystemPrompt } from '../dist/agent/prompts.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEMP_WORKSPACE = path.join(os.tmpdir(), `talon-integration-${Date.now()}`);

function setup() {
    fs.mkdirSync(TEMP_WORKSPACE, { recursive: true });
    
    // Create EMPTY workspace files (simulating fresh install or reset)
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'USER.md'), `# USER

**Name:**
**What to call them:**
**Timezone:**
`);

    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'IDENTITY.md'), `# IDENTITY

**Name:** *(pick something you like)*
**Creature:** *(AI? robot?)*
`);

    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'MEMORY.md'), `# MEMORY

## Entries

*(Nothing yet.)*
`);

    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), `You are Talon.`);
}

function cleanup() {
    fs.rmSync(TEMP_WORKSPACE, { recursive: true, force: true });
}

function simulateConversation() {
    console.log('🎭 Simulating conversation scenario:\n');
    console.log('Message 1: User says "Hello"');
    console.log('Message 2: Agent says "I don\'t know who you are"');
    console.log('Message 3: User says "I\'m Orlando with goal X"');
    console.log('Message 4: Agent should NOT claim to remember from "previous sessions"\n');
    
    // Build system prompt as it would be on Message 4
    // (after user introduced themselves but BEFORE they wrote to USER.md)
    const soul = fs.readFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), 'utf-8');
    const prompt = buildSystemPrompt(soul, ['file_read', 'file_write'], TEMP_WORKSPACE);
    
    console.log('📋 Checking system prompt for anti-hallucination rules:\n');
    
    // Key checks
    const checks = [
        {
            name: 'Has critical memory rules section',
            test: () => prompt.includes('CRITICAL: Memory and Session Rules'),
        },
        {
            name: 'Warns about session history vs persistent memory',
            test: () => prompt.includes('DO NOT confuse session history with persistent memory'),
        },
        {
            name: 'States workspace files are source of truth',
            test: () => prompt.includes('WORKSPACE FILES ARE YOUR ONLY SOURCE OF TRUTH'),
        },
        {
            name: 'Explains empty USER.md means first time',
            test: () => prompt.includes('If USER.md is empty → this is the FIRST TIME'),
        },
        {
            name: 'Instructs to NOT claim memory without files',
            test: () => prompt.includes('Do NOT say "I already know you" unless USER.md actually contains their information'),
        },
        {
            name: 'Warns about info in messages but not files',
            test: () => prompt.includes('If you see information in earlier messages but NOT in workspace files'),
        },
        {
            name: 'Does NOT include user info (files are empty)',
            test: () => !prompt.includes('## About the User'),
        },
        {
            name: 'Does NOT include greeting (no name extracted)',
            test: () => !prompt.includes('First Message Greeting'),
        },
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const check of checks) {
        const result = check.test();
        if (result) {
            console.log(`✅ ${check.name}`);
            passed++;
        } else {
            console.log(`❌ ${check.name}`);
            failed++;
        }
    }
    
    console.log(`\n📊 Results: ${passed}/${checks.length} checks passed\n`);
    
    if (failed > 0) {
        console.error('❌ INTEGRATION TEST FAILED');
        console.error('The system prompt does not contain sufficient anti-hallucination rules.\n');
        return false;
    }
    
    console.log('✅ INTEGRATION TEST PASSED');
    console.log('The system prompt correctly prevents hallucination from session history.\n');
    return true;
}

function testPromptContent() {
    console.log('🔍 Detailed prompt analysis:\n');
    
    const soul = fs.readFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), 'utf-8');
    const prompt = buildSystemPrompt(soul, ['file_read', 'file_write'], TEMP_WORKSPACE);
    
    // Extract the critical rules section
    const criticalStart = prompt.indexOf('## 🧠 CRITICAL: Memory and Session Rules');
    const criticalEnd = prompt.indexOf('## Your Capabilities');
    
    if (criticalStart === -1 || criticalEnd === -1) {
        console.error('❌ Could not find critical rules section in prompt');
        return false;
    }
    
    const criticalSection = prompt.substring(criticalStart, criticalEnd);
    
    console.log('Critical Rules Section:');
    console.log('─'.repeat(60));
    console.log(criticalSection.trim());
    console.log('─'.repeat(60));
    console.log();
    
    // Count key phrases
    const keyPhrases = [
        'WORKSPACE FILES ARE YOUR ONLY SOURCE OF TRUTH',
        'DO NOT confuse session history',
        'If USER.md is empty',
        'Do NOT say "I already know you"',
    ];
    
    console.log('Key phrase occurrences:');
    for (const phrase of keyPhrases) {
        const count = (criticalSection.match(new RegExp(phrase, 'g')) || []).length;
        console.log(`  "${phrase}": ${count}`);
    }
    console.log();
    
    return true;
}

// Run integration test
console.log('═══════════════════════════════════════════════════════════');
console.log('  Memory Hallucination Integration Test');
console.log('  Scenario: User introduces themselves in session');
console.log('═══════════════════════════════════════════════════════════\n');

try {
    setup();
    
    const test1 = simulateConversation();
    const test2 = testPromptContent();
    
    cleanup();
    
    console.log('═══════════════════════════════════════════════════════════');
    if (test1 && test2) {
        console.log('✅ INTEGRATION TEST SUITE PASSED');
        console.log('═══════════════════════════════════════════════════════════\n');
        process.exit(0);
    } else {
        console.log('❌ INTEGRATION TEST SUITE FAILED');
        console.log('═══════════════════════════════════════════════════════════\n');
        process.exit(1);
    }
} catch (error) {
    cleanup();
    console.error('\n❌ TEST ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
}
