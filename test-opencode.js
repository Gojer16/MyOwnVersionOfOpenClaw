#!/usr/bin/env node

const API_KEY = 'sk-85lDP2WBi5wT3hjwe3PUrckciwZwMnBkNSpjgXj4cWdISFj5iOEPQuZ5gZjgzpXA';
const BASE_URL = 'https://opencode.ai/zen/v1/chat/completions';

const models = [
  'minimax-m2.5-free',
  'glm-5-free',
  'kimi-k2.5-free',
  'big-pickle'
];

async function testModel(model, useKey) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (useKey) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "Hello from ' + model + '"' }],
        max_tokens: 50
      })
    });

    const data = await response.json();
    
    console.log(`\n✓ ${model} ${useKey ? 'WITH' : 'WITHOUT'} key:`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${data.choices?.[0]?.message?.content || JSON.stringify(data)}`);
    
    return true;
  } catch (error) {
    console.log(`\n✗ ${model} ${useKey ? 'WITH' : 'WITHOUT'} key: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('Testing OpenCode Free Models\n' + '='.repeat(50));
  
  for (const model of models) {
    await testModel(model, false);
    await testModel(model, true);
  }
}

runTests();
