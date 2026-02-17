// ─── Cron/Scheduler System ────────────────────────────────────────
// Background task scheduling and execution
// Based on OpenClaw's cron architecture

import { z } from 'zod';
import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';

// ─── Cron Job Schema ──────────────────────────────────────────────

export const CronJobSchema = z.object({
    id: z.string(),
    name: z.string(),
    schedule: z.string(), // Cron expression or special keywords
    command: z.string(),  // Command to execute
    args: z.array(z.unknown()).default([]),
    enabled: z.boolean().default(true),
    timeout: z.number().default(30000), // 30s default
    retryCount: z.number().default(3),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.number(),
    lastRun: z.number().optional(),
    nextRun: z.number().optional(),
    runCount: z.number().default(0),
    failCount: z.number().default(0),
});

export type CronJob = z.infer<typeof CronJobSchema>;

export const CronRunLogSchema = z.object({
    id: z.string(),
    jobId: z.string(),
    startedAt: z.number(),
    completedAt: z.number().optional(),
    status: z.enum(['running', 'completed', 'failed', 'timeout']),
    output: z.string().optional(),
    error: z.string().optional(),
    duration: z.number().optional(),
});

export type CronRunLog = z.infer<typeof CronRunLogSchema>;

// ─── Cron Expression Parser ───────────────────────────────────────

export class CronExpression {
    private fields: number[][];
    
    constructor(private expression: string) {
        this.fields = this.parse(expression);
    }
    
    private parse(expr: string): number[][] {
        // Special keywords
        const special: Record<string, string> = {
            '@yearly': '0 0 1 1 *',
            '@monthly': '0 0 1 * *',
            '@weekly': '0 0 * * 0',
            '@daily': '0 0 * * *',
            '@hourly': '0 * * * *',
            '@reboot': 'REBOOT',
        };
        
        const normalized = special[expr] ?? expr;
        
        if (normalized === 'REBOOT') {
            return [[0], [0], [1], [1], [1]]; // Run once at startup
        }
        
        const parts = normalized.split(' ');
        if (parts.length !== 5) {
            throw new Error(`Invalid cron expression: ${expr}`);
        }
        
        return parts.map((part, index) => this.parseField(part, index));
    }
    
    private parseField(field: string, index: number): number[] {
        const ranges: number[][] = [];
        const max = [59, 23, 31, 12, 6][index]; // min, hour, day, month, dow
        
        for (const part of field.split(',')) {
            if (part === '*') {
                ranges.push([0, max]);
            } else if (part.includes('/')) {
                const [range, step] = part.split('/');
                const stepNum = parseInt(step, 10);
                if (range === '*') {
                    for (let i = 0; i <= max; i += stepNum) {
                        ranges.push([i, i]);
                    }
                } else {
                    const start = parseInt(range, 10);
                    for (let i = start; i <= max; i += stepNum) {
                        ranges.push([i, i]);
                    }
                }
            } else if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                ranges.push([start, end]);
            } else {
                ranges.push([parseInt(part, 10), parseInt(part, 10)]);
            }
        }
        
        const values = new Set<number>();
        for (const [start, end] of ranges) {
            for (let i = start; i <= end && i <= max; i++) {
                values.add(i);
            }
        }
        
        return Array.from(values).sort((a, b) => a - b);
    }
    
    /**
     * Get next occurrence after given date
     */
    next(from: Date = new Date()): Date {
        const date = new Date(from);
        date.setMilliseconds(0);
        date.setSeconds(0);
        
        // Add 1 minute to find next occurrence
        date.setMinutes(date.getMinutes() + 1);
        
        // Search for next match (max 4 years to avoid infinite loop)
        const maxIterations = 366 * 24 * 60 * 4;
        for (let i = 0; i < maxIterations; i++) {
            if (this.matches(date)) {
                return date;
            }
            date.setMinutes(date.getMinutes() + 1);
        }
        
        throw new Error('Could not find next occurrence');
    }
    
    /**
     * Check if date matches this cron expression
     */
    matches(date: Date): boolean {
        const [minutes, hours, days, months, dow] = this.fields;
        
        return (
            minutes.includes(date.getMinutes()) &&
            hours.includes(date.getHours()) &&
            days.includes(date.getDate()) &&
            months.includes(date.getMonth() + 1) &&
            dow.includes(date.getDay())
        );
    }
    
    toString(): string {
        return this.expression;
    }
}

// ─── Cron Service ─────────────────────────────────────────────────

export class CronService extends EventEmitter {
    private jobs = new Map<string, CronJob>();
    private runLogs = new Map<string, CronRunLog[]>();
    private timers = new Map<string, NodeJS.Timeout>();
    private running = false;
    private checkInterval: NodeJS.Timeout | null = null;
    
    constructor(private checkFrequencyMs: number = 60000) { // Check every minute
        super();
    }
    
    /**
     * Start the cron service
     */
    start(): void {
        if (this.running) return;
        
        this.running = true;
        logger.info('Cron service started');
        
        // Check every minute for jobs to run
        this.checkInterval = setInterval(() => this.checkJobs(), this.checkFrequencyMs);
        
        // Immediate check
        this.checkJobs();
        
        this.emit('started');
    }
    
    /**
     * Stop the cron service
     */
    stop(): void {
        if (!this.running) return;
        
        this.running = false;
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        // Clear all timers
        for (const [id, timer] of this.timers) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
        
        logger.info('Cron service stopped');
        this.emit('stopped');
    }
    
    /**
     * Add a new cron job
     */
    addJob(job: Omit<CronJob, 'id' | 'createdAt' | 'runCount' | 'failCount'>): CronJob {
        const id = `cron_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const fullJob: CronJob = {
            ...job,
            id,
            createdAt: Date.now(),
            runCount: 0,
            failCount: 0,
        };
        
        // Validate cron expression
        try {
            const cron = new CronExpression(job.schedule);
            fullJob.nextRun = cron.next().getTime();
        } catch (err) {
            throw new Error(`Invalid cron expression: ${job.schedule}`);
        }
        
        this.jobs.set(id, fullJob);
        this.runLogs.set(id, []);
        
        logger.info({ jobId: id, name: job.name, schedule: job.schedule }, 'Cron job added');
        this.emit('jobAdded', fullJob);
        
        return fullJob;
    }
    
    /**
     * Remove a cron job
     */
    removeJob(id: string): boolean {
        const job = this.jobs.get(id);
        if (!job) return false;
        
        // Clear timer if exists
        const timer = this.timers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
        
        this.jobs.delete(id);
        this.runLogs.delete(id);
        
        logger.info({ jobId: id }, 'Cron job removed');
        this.emit('jobRemoved', job);
        
        return true;
    }
    
    /**
     * Enable/disable a job
     */
    setEnabled(id: string, enabled: boolean): boolean {
        const job = this.jobs.get(id);
        if (!job) return false;
        
        job.enabled = enabled;
        
        if (enabled) {
            // Recalculate next run
            try {
                const cron = new CronExpression(job.schedule);
                job.nextRun = cron.next().getTime();
            } catch {
                job.nextRun = undefined;
            }
        } else {
            // Clear timer
            const timer = this.timers.get(id);
            if (timer) {
                clearTimeout(timer);
                this.timers.delete(id);
            }
            job.nextRun = undefined;
        }
        
        logger.info({ jobId: id, enabled }, 'Cron job status changed');
        this.emit('jobStatusChanged', job);
        
        return true;
    }
    
    /**
     * Get a job by ID
     */
    getJob(id: string): CronJob | undefined {
        return this.jobs.get(id);
    }
    
    /**
     * Get all jobs
     */
    getAllJobs(): CronJob[] {
        return Array.from(this.jobs.values());
    }
    
    /**
     * Get enabled jobs
     */
    getEnabledJobs(): CronJob[] {
        return this.getAllJobs().filter(j => j.enabled);
    }
    
    /**
     * Get run logs for a job
     */
    getRunLogs(jobId: string): CronRunLog[] {
        return this.runLogs.get(jobId) ?? [];
    }
    
    /**
     * Run a job immediately
     */
    async runNow(id: string): Promise<CronRunLog> {
        const job = this.jobs.get(id);
        if (!job) throw new Error(`Job not found: ${id}`);
        
        return this.executeJob(job);
    }
    
    /**
     * Check and run due jobs
     */
    private checkJobs(): void {
        const now = Date.now();
        
        for (const job of this.getEnabledJobs()) {
            if (job.nextRun && job.nextRun <= now) {
                this.scheduleJobExecution(job);
            }
        }
    }
    
    /**
     * Schedule a job for execution
     */
    private scheduleJobExecution(job: CronJob): void {
        // Prevent duplicate execution
        if (this.timers.has(job.id)) return;
        
        const timer = setTimeout(async () => {
            this.timers.delete(job.id);
            await this.executeJob(job);
        }, 0);
        
        this.timers.set(job.id, timer);
    }
    
    /**
     * Execute a job
     */
    private async executeJob(job: CronJob): Promise<CronRunLog> {
        const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const runLog: CronRunLog = {
            id: runId,
            jobId: job.id,
            startedAt: Date.now(),
            status: 'running',
        };
        
        // Add to logs
        const logs = this.runLogs.get(job.id) ?? [];
        logs.push(runLog);
        this.runLogs.set(job.id, logs);
        
        logger.info({ jobId: job.id, runId }, 'Cron job started');
        this.emit('jobStarted', job, runLog);
        
        try {
            // Execute with timeout
            const result = await this.runWithTimeout(job, runLog);
            
            // Update job stats
            job.runCount++;
            job.lastRun = Date.now();
            
            // Calculate next run
            try {
                const cron = new CronExpression(job.schedule);
                job.nextRun = cron.next().getTime();
            } catch {
                job.nextRun = undefined;
            }
            
            // Update run log
            runLog.status = 'completed';
            runLog.completedAt = Date.now();
            runLog.output = result;
            runLog.duration = runLog.completedAt - runLog.startedAt;
            
            logger.info({ jobId: job.id, runId, duration: runLog.duration }, 'Cron job completed');
            this.emit('jobCompleted', job, runLog);
            
        } catch (err) {
            // Update job stats
            job.failCount++;
            job.lastRun = Date.now();
            
            // Update run log
            runLog.status = err instanceof Error && err.message === 'Timeout' ? 'timeout' : 'failed';
            runLog.completedAt = Date.now();
            runLog.error = err instanceof Error ? err.message : String(err);
            runLog.duration = runLog.completedAt - runLog.startedAt;
            
            logger.error({ jobId: job.id, runId, err }, 'Cron job failed');
            this.emit('jobFailed', job, runLog, err);
        }
        
        return runLog;
    }
    
    /**
     * Run job with timeout
     */
    private runWithTimeout(job: CronJob, runLog: CronRunLog): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout'));
            }, job.timeout);
            
            this.executeCommand(job)
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(err => {
                    clearTimeout(timeout);
                    reject(err);
                });
        });
    }
    
    /**
     * Execute the job command
     */
    private async executeCommand(job: CronJob): Promise<string> {
        // This is a placeholder - in a real implementation,
        // this would execute the command through the agent or shell
        
        // For now, emit an event that can be handled by the gateway
        this.emit('executeCommand', job);
        
        return `Executed: ${job.command}`;
    }
    
    /**
     * Get service status
     */
    getStatus(): {
        running: boolean;
        jobCount: number;
        enabledCount: number;
    } {
        return {
            running: this.running,
            jobCount: this.jobs.size,
            enabledCount: this.getEnabledJobs().length,
        };
    }
}

// ─── Cron Expression Helpers ──────────────────────────────────────

export const CronPresets = {
    EVERY_MINUTE: '* * * * *',
    EVERY_5_MINUTES: '*/5 * * * *',
    EVERY_15_MINUTES: '*/15 * * * *',
    EVERY_30_MINUTES: '*/30 * * * *',
    HOURLY: '0 * * * *',
    DAILY: '0 0 * * *',
    WEEKLY: '0 0 * * 0',
    MONTHLY: '0 0 1 * *',
    YEARLY: '0 0 1 1 *',
    ON_REBOOT: '@reboot',
} as const;

// ─── Export Singleton ─────────────────────────────────────────────

export const cronService = new CronService();
