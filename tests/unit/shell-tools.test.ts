// ─── Shell Tools Tests ────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ShellResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: string;
}

class MockShellTools {
    private blockedCommands = ['rm -rf /', 'sudo rm', 'format'];

    async execute(command: string, timeout = 30000): Promise<ShellResult> {
        // Check blocked commands
        if (this.isBlocked(command)) {
            return {
                success: false,
                error: 'Command blocked for safety',
            };
        }

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout,
                maxBuffer: 1024 * 1024, // 1MB
            });

            return {
                success: true,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
            };
        } catch (error: any) {
            return {
                success: false,
                stdout: error.stdout?.trim(),
                stderr: error.stderr?.trim(),
                exitCode: error.code,
                error: error.message,
            };
        }
    }

    private isBlocked(command: string): boolean {
        return this.blockedCommands.some(blocked => 
            command.toLowerCase().includes(blocked.toLowerCase())
        );
    }
}

describe('Shell Tools', () => {
    let shellTools: MockShellTools;

    beforeEach(() => {
        shellTools = new MockShellTools();
    });

    describe('shell_execute', () => {
        it('should execute simple command', async () => {
            const result = await shellTools.execute('echo "Hello World"');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('Hello World');
            expect(result.exitCode).toBe(0);
        });

        it('should execute command with output', async () => {
            const result = await shellTools.execute('pwd');

            expect(result.success).toBe(true);
            expect(result.stdout).toBeDefined();
            expect(result.stdout!.length).toBeGreaterThan(0);
        });

        it('should handle command with arguments', async () => {
            const result = await shellTools.execute('printf "test"');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('test');
        });

        it('should capture stderr', async () => {
            const result = await shellTools.execute('node -e "console.error(\'error\')"');

            expect(result.success).toBe(true);
            expect(result.stderr).toContain('error');
        });

        it('should handle command failure', async () => {
            const result = await shellTools.execute('exit 1');

            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
        });

        it('should handle non-existent command', async () => {
            const result = await shellTools.execute('nonexistentcommand123');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('Safety Features', () => {
        it('should block dangerous rm command', async () => {
            const result = await shellTools.execute('rm -rf /');

            expect(result.success).toBe(false);
            expect(result.error).toContain('blocked');
        });

        it('should block sudo rm command', async () => {
            const result = await shellTools.execute('sudo rm -rf /home');

            expect(result.success).toBe(false);
            expect(result.error).toContain('blocked');
        });

        it('should block format command', async () => {
            const result = await shellTools.execute('format c:');

            expect(result.success).toBe(false);
            expect(result.error).toContain('blocked');
        });

        it('should allow safe rm commands', async () => {
            const result = await shellTools.execute('echo "rm file.txt"');

            expect(result.success).toBe(true);
        });
    });

    describe('Command Chaining', () => {
        it('should execute piped commands', async () => {
            const result = await shellTools.execute('echo "hello" | tr a-z A-Z');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('HELLO');
        });

        it('should execute commands with &&', async () => {
            const result = await shellTools.execute('echo "first" && echo "second"');

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('first');
            expect(result.stdout).toContain('second');
        });

        it('should handle command substitution', async () => {
            const result = await shellTools.execute('echo $(echo "nested")');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('nested');
        });
    });

    describe('Environment Variables', () => {
        it('should access environment variables', async () => {
            const result = await shellTools.execute('echo $HOME');

            expect(result.success).toBe(true);
            expect(result.stdout).toBeDefined();
            expect(result.stdout!.length).toBeGreaterThan(0);
        });

        it('should handle undefined variables', async () => {
            const result = await shellTools.execute('echo $NONEXISTENT_VAR_12345');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('');
        });
    });

    describe('Timeout Handling', () => {
        it('should timeout long-running commands', async () => {
            const result = await shellTools.execute('sleep 10', 100);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        }, 10000);

        it('should complete fast commands within timeout', async () => {
            const result = await shellTools.execute('echo "fast"', 5000);

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('fast');
        });
    });

    describe('Output Handling', () => {
        it('should handle large output', async () => {
            const result = await shellTools.execute('seq 1 100');

            expect(result.success).toBe(true);
            expect(result.stdout).toBeDefined();
            expect(result.stdout!.split('\n').length).toBe(100);
        });

        it('should handle empty output', async () => {
            const result = await shellTools.execute('true');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('');
        });

        it('should handle multiline output', async () => {
            const result = await shellTools.execute('echo -e "line1\\nline2\\nline3"');

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('line1');
            expect(result.stdout).toContain('line2');
            expect(result.stdout).toContain('line3');
        });
    });

    describe('Special Characters', () => {
        it('should handle quotes in commands', async () => {
            const result = await shellTools.execute('echo "hello \\"world\\""');

            expect(result.success).toBe(true);
            expect(result.stdout).toContain('world');
        });

        it('should handle special characters', async () => {
            const result = await shellTools.execute('echo "!@#$%^&*()"');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('!@#$%^&*()');
        });

        it('should handle unicode characters', async () => {
            const result = await shellTools.execute('echo "你好世界"');

            expect(result.success).toBe(true);
            expect(result.stdout).toBe('你好世界');
        });
    });
});
