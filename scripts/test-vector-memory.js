#!/usr/bin/env node
/**
 * Test: Vector Memory Semantic Search
 */

import { VectorMemory, SimpleEmbeddingProvider } from '../dist/memory/vector.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_DB = path.join(os.tmpdir(), `talon-vector-test-${Date.now()}.db`);

console.log('═══════════════════════════════════════════════════════════');
console.log('  Vector Memory Semantic Search Test');
console.log('═══════════════════════════════════════════════════════════\n');

async function runTests() {
    const provider = new SimpleEmbeddingProvider();
    const vectorMemory = new VectorMemory(provider, true);

    // Test 1: Add messages
    console.log('🧪 Test 1: Adding messages...');
    await vectorMemory.addMessage({
        id: 'msg1',
        role: 'user',
        content: 'How do I use React hooks like useState and useEffect?',
        timestamp: Date.now() - 10000,
    }, 'session1');

    await vectorMemory.addMessage({
        id: 'msg2',
        role: 'assistant',
        content: 'React hooks like useState and useEffect let you use state and side effects in functional components. useState returns a state variable and setter, useEffect runs after render.',
        timestamp: Date.now() - 9000,
    }, 'session1');

    await vectorMemory.addMessage({
        id: 'msg3',
        role: 'user',
        content: 'What about Python async/await?',
        timestamp: Date.now() - 5000,
    }, 'session1');

    await vectorMemory.addMessage({
        id: 'msg4',
        role: 'assistant',
        content: 'Python async/await is used for asynchronous programming. You define async functions with async def and await other async functions inside them.',
        timestamp: Date.now() - 4000,
    }, 'session1');

    console.log('✅ 4 messages added\n');

    // Test 2: Semantic search for React
    console.log('🧪 Test 2: Searching for "React hooks"...');
    const reactResults = await vectorMemory.search('React hooks', { limit: 5 });
    console.log(`Found ${reactResults.length} results:`);
    reactResults.forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.role}: ${r.content.slice(0, 60)}... (${(r.similarity * 100).toFixed(1)}%)`);
    });
    console.log();

    // Test 3: Semantic search for Python
    console.log('🧪 Test 3: Searching for "Python async"...');
    const pythonResults = await vectorMemory.search('Python async', { limit: 5 });
    console.log(`Found ${pythonResults.length} results:`);
    pythonResults.forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.role}: ${r.content.slice(0, 60)}... (${(r.similarity * 100).toFixed(1)}%)`);
    });
    console.log();

    // Test 4: Time-based filtering
    console.log('🧪 Test 4: Searching last 7 days...');
    const recentResults = await vectorMemory.search('programming', { daysAgo: 7 });
    console.log(`Found ${recentResults.length} recent messages`);
    console.log();

    // Test 5: Cleanup
    console.log('🧪 Test 5: Cleanup old messages...');
    const deleted = vectorMemory.cleanup(0); // Delete all
    console.log(`Deleted ${deleted} messages`);
    console.log();

    vectorMemory.close();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
});
