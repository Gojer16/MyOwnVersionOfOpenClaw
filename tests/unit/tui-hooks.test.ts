// tests/unit/tui-hooks.test.ts
import { describe, it, expect } from 'vitest';

describe('useGateway', () => {
  it('should exist as a module', async () => {
    const module = await import('@/tui/hooks/use-gateway.js');
    expect(module.useGateway).toBeDefined();
    expect(typeof module.useGateway).toBe('function');
  });
});
