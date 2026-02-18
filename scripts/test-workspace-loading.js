#!/usr/bin/env node
// Quick test to verify workspace file loading
import { loadSoul, loadUser, loadIdentity } from '../dist/agent/prompts.js';
import os from 'node:os';
import path from 'node:path';

const workspaceRoot = path.join(os.homedir(), '.talon/workspace');

console.log('🧪 Testing workspace file loading...\n');

try {
    const soul = loadSoul(workspaceRoot);
    console.log('✅ SOUL.md loaded:', soul.substring(0, 50) + '...');
    
    const user = loadUser(workspaceRoot);
    if (user) {
        console.log('✅ USER.md loaded:', user.substring(0, 50) + '...');
    } else {
        console.log('⚠️  USER.md not found (will be created on first run)');
    }
    
    const identity = loadIdentity(workspaceRoot);
    if (identity) {
        console.log('✅ IDENTITY.md loaded:', identity.substring(0, 50) + '...');
    } else {
        console.log('⚠️  IDENTITY.md not found (will be created on first run)');
    }
    
    console.log('\n✅ All workspace files load correctly!');
    process.exit(0);
} catch (err) {
    console.error('\n❌ Error loading workspace files:', err.message);
    process.exit(1);
}
