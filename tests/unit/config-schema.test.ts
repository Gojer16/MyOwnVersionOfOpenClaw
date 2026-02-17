// ─── Config Loader Tests ──────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { TalonConfigSchema } from '@/config/schema.js';

describe('Config Schema', () => {
    describe('TalonConfigSchema', () => {
        it('should validate minimal config', () => {
            const minimalConfig = {
                agent: {
                    model: 'deepseek-chat',
                    providers: {
                        deepseek: {
                            apiKey: 'test-key',
                            models: ['deepseek-chat'],
                        },
                    },
                },
            };

            const result = TalonConfigSchema.safeParse(minimalConfig);
            expect(result.success).toBe(true);
        });

        it('should apply defaults for missing fields', () => {
            const minimalConfig = {
                agent: {
                    model: 'deepseek-chat',
                    providers: {
                        deepseek: {
                            apiKey: 'test-key',
                            models: ['deepseek-chat'],
                        },
                    },
                },
            };

            const result = TalonConfigSchema.parse(minimalConfig);
            
            // Check defaults
            expect(result.gateway.host).toBe('127.0.0.1');
            expect(result.gateway.port).toBe(19789);
            expect(result.tools.files.enabled).toBe(true);
            expect(result.tools.shell.enabled).toBe(true);
        });

        it('should validate channel configs', () => {
            const configWithChannels = {
                agent: {
                    model: 'deepseek-chat',
                    providers: {
                        deepseek: {
                            apiKey: 'test-key',
                            models: ['deepseek-chat'],
                        },
                    },
                },
                channels: {
                    telegram: {
                        enabled: true,
                        botToken: 'test-token',
                    },
                    whatsapp: {
                        enabled: false,
                    },
                },
            };

            const result = TalonConfigSchema.safeParse(configWithChannels);
            expect(result.success).toBe(true);
        });

        it('should reject invalid config', () => {
            const invalidConfig = {
                agent: {
                    model: 'deepseek-chat',
                    // Missing providers
                },
            };

            const result = TalonConfigSchema.safeParse(invalidConfig);
            expect(result.success).toBe(false);
        });

        it('should validate tool configs', () => {
            const configWithTools = {
                agent: {
                    model: 'deepseek-chat',
                    providers: {
                        deepseek: {
                            apiKey: 'test-key',
                            models: ['deepseek-chat'],
                        },
                    },
                },
                tools: {
                    files: {
                        enabled: true,
                        allowedPaths: ['/home/user'],
                    },
                    shell: {
                        enabled: true,
                        requireConfirmation: true,
                        blockedCommands: ['rm -rf /'],
                    },
                },
            };

            const result = TalonConfigSchema.safeParse(configWithTools);
            expect(result.success).toBe(true);
        });
    });
});
