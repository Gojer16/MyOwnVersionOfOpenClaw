#!/usr/bin/env node

const API_KEY = 'sk-85lDP2WBi5wT3hjwe3PUrckciwZwMnBkNSpjgXj4cWdISFj5iOEPQuZ5gZjgzpXA';

async function testGPT5Nano(useKey) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (useKey) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  try {
    const response = await fetch('https://opencode.ai/zen/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: [{ role: 'user', content: 'Say "Hello from GPT-5 Nano"' }],
        max_tokens: 50
      })
    });

    const data = await response.json();
    
    console.log(`\n✓ GPT-5 Nano ${useKey ? 'WITH' : 'WITHOUT'} key:`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(data, null, 2)}`);
    
    return true;
  } catch (error) {
    console.log(`\n✗ GPT-5 Nano ${useKey ? 'WITH' : 'WITHOUT'} key: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('Testing GPT-5 Nano (Different Endpoint)\n' + '='.repeat(50));
  
  await testGPT5Nano(false);
  await testGPT5Nano(true);
}

runTests();
