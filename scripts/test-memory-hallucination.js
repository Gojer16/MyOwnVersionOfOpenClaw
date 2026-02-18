#!/usr/bin/env node
/**
 * Test: Verify system prompt prevents hallucination from session history
 * 
 * This test ensures the agent doesn't claim to "remember" information
 * from earlier in the session if it's not in workspace files.
 */

import { buildSystemPrompt } from '../dist/agent/prompts.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEMP_WORKSPACE = path.join(os.tmpdir(), `talon-test-${Date.now()}`);

function setup() {
    // Create temp workspace with EMPTY template files
    fs.mkdirSync(TEMP_WORKSPACE, { recursive: true });
    
    // Create empty USER.md (template state)
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'USER.md'), `# USER

Learn about the person you're helping. Update this as you go.

**Name:**
**What to call them:**
**Pronouns:** *(optional)*
**Timezone:**

## Context

*(What do they care about? What are they working on? What makes them tick?)*
`);

    // Create empty IDENTITY.md (template state)
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'IDENTITY.md'), `# IDENTITY

Fill this in during your first conversation. Make it yours.

**Name:** *(pick something you like)*
**Creature:** *(AI? robot? familiar? ghost in the machine? something weirder?)*
**Vibe:** *(how do you come across? sharp? warm? chaotic? calm?)*
**Emoji:** *(your signature — pick one that feels right)*
`);

    // Create empty MEMORY.md (template state)
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'MEMORY.md'), `# MEMORY

Your long-term memory. Curated, not raw.

## Entries

*(Nothing yet. You'll fill this in as you go.)*
`);

    // Create SOUL.md
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), `You are Talon, a personal AI assistant.`);
}

function cleanup() {
    fs.rmSync(TEMP_WORKSPACE, { recursive: true, force: true });
}

function testEmptyWorkspacePrompt() {
    console.log('🧪 Test 1: Empty workspace files should NOT claim to know user\n');
    
    const soul = fs.readFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), 'utf-8');
    const prompt = buildSystemPrompt(soul, ['file_read', 'file_write'], TEMP_WORKSPACE);
    
    // Check that critical memory rules are present
    const hasCriticalRules = prompt.includes('CRITICAL: Memory and Session Rules');
    const hasWorkspaceSourceOfTruth = prompt.includes('WORKSPACE FILES ARE YOUR ONLY SOURCE OF TRUTH');
    const hasSessionHistoryWarning = prompt.includes('DO NOT confuse session history with persistent memory');
    const hasEmptyFileRule = prompt.includes('If USER.md is empty → this is the FIRST TIME');
    
    console.log('✓ Critical memory rules present:', hasCriticalRules);
    console.log('✓ Workspace source of truth rule:', hasWorkspaceSourceOfTruth);
    console.log('✓ Session history warning:', hasSessionHistoryWarning);
    console.log('✓ Empty file rule:', hasEmptyFileRule);
    
    // Check that USER.md and IDENTITY.md sections are NOT added (because they're empty)
    const hasUserSection = prompt.includes('## About the User');
    const hasIdentitySection = prompt.includes('## Your Identity');
    
    console.log('✓ USER.md section NOT added (empty):', !hasUserSection);
    console.log('✓ IDENTITY.md section NOT added (empty):', !hasIdentitySection);
    
    if (!hasCriticalRules || !hasWorkspaceSourceOfTruth || !hasSessionHistoryWarning || !hasEmptyFileRule) {
        console.error('\n❌ FAIL: Critical memory rules missing from prompt');
        return false;
    }
    
    if (hasUserSection || hasIdentitySection) {
        console.error('\n❌ FAIL: Empty workspace files should not be added to prompt');
        return false;
    }
    
    console.log('\n✅ PASS: Empty workspace correctly handled\n');
    return true;
}

function testFilledWorkspacePrompt() {
    console.log('🧪 Test 2: Filled workspace files should be loaded into prompt\n');
    
    // Fill USER.md with actual data
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'USER.md'), `# USER

**Name:** Orlando Ascanio
**What to call them:** Orlando
**Timezone:** America/Caracas

## Context

Junior AI Engineer building toward founder/CEO path.

## Goals

Live free as a wealthy, impactful founder with global mobility.
`);

    // Fill IDENTITY.md
    fs.writeFileSync(path.join(TEMP_WORKSPACE, 'IDENTITY.md'), `# IDENTITY

**Name:** Talon
**Creature:** AI assistant
**Vibe:** Direct and helpful
**Emoji:** 🦅
`);
    
    const soul = fs.readFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), 'utf-8');
    const prompt = buildSystemPrompt(soul, ['file_read', 'file_write'], TEMP_WORKSPACE);
    
    // Check that USER.md and IDENTITY.md sections ARE added
    const hasUserSection = prompt.includes('## About the User');
    const hasIdentitySection = prompt.includes('## Your Identity');
    const hasUserName = prompt.includes('Orlando Ascanio');
    const hasIdentityName = prompt.includes('Talon');
    const hasGreeting = prompt.includes('First Message Greeting');
    
    console.log('✓ USER.md section added:', hasUserSection);
    console.log('✓ IDENTITY.md section added:', hasIdentitySection);
    console.log('✓ User name in prompt:', hasUserName);
    console.log('✓ Identity name in prompt:', hasIdentityName);
    console.log('✓ Greeting instruction added:', hasGreeting);
    
    // Critical rules should still be present
    const hasCriticalRules = prompt.includes('CRITICAL: Memory and Session Rules');
    console.log('✓ Critical memory rules still present:', hasCriticalRules);
    
    if (!hasUserSection || !hasIdentitySection || !hasUserName || !hasIdentityName || !hasCriticalRules) {
        console.error('\n❌ FAIL: Filled workspace files not properly loaded');
        return false;
    }
    
    console.log('\n✅ PASS: Filled workspace correctly loaded\n');
    return true;
}

function testPromptStructure() {
    console.log('🧪 Test 3: Verify prompt structure and ordering\n');
    
    const soul = fs.readFileSync(path.join(TEMP_WORKSPACE, 'SOUL.md'), 'utf-8');
    const prompt = buildSystemPrompt(soul, ['file_read', 'file_write'], TEMP_WORKSPACE);
    
    // Check that sections appear in correct order
    const criticalRulesIndex = prompt.indexOf('CRITICAL: Memory and Session Rules');
    const capabilitiesIndex = prompt.indexOf('## Your Capabilities');
    const toolsIndex = prompt.indexOf('## Available Tools');
    
    const correctOrder = criticalRulesIndex < capabilitiesIndex && capabilitiesIndex < toolsIndex;
    
    console.log('✓ Critical rules before capabilities:', criticalRulesIndex < capabilitiesIndex);
    console.log('✓ Capabilities before tools:', capabilitiesIndex < toolsIndex);
    console.log('✓ Overall structure correct:', correctOrder);
    
    if (!correctOrder) {
        console.error('\n❌ FAIL: Prompt sections in wrong order');
        return false;
    }
    
    console.log('\n✅ PASS: Prompt structure correct\n');
    return true;
}

// Run tests
console.log('═══════════════════════════════════════════════════════════');
console.log('  Memory Hallucination Prevention Test Suite');
console.log('═══════════════════════════════════════════════════════════\n');

try {
    setup();
    
    const test1 = testEmptyWorkspacePrompt();
    const test2 = testFilledWorkspacePrompt();
    const test3 = testPromptStructure();
    
    cleanup();
    
    console.log('═══════════════════════════════════════════════════════════');
    if (test1 && test2 && test3) {
        console.log('✅ ALL TESTS PASSED (3/3)');
        console.log('═══════════════════════════════════════════════════════════\n');
        process.exit(0);
    } else {
        console.log('❌ SOME TESTS FAILED');
        console.log('═══════════════════════════════════════════════════════════\n');
        process.exit(1);
    }
} catch (error) {
    cleanup();
    console.error('\n❌ TEST ERROR:', error.message);
    process.exit(1);
}
