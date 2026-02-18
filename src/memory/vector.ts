// ─── Vector Memory with SQLite-vec ────────────────────────────────
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { Message } from '../utils/types.js';
import { logger } from '../utils/logger.js';

const TALON_HOME = path.join(os.homedir(), '.talon');
const VECTOR_DB_PATH = path.join(TALON_HOME, 'vector-memory.db');

interface SearchResult {
    messageId: string;
    sessionId: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: number;
    similarity: number;
}

export class VectorMemory {
    private db: Database.Database | null = null;
    private embeddingProvider: EmbeddingProvider;
    private enabled: boolean;

    constructor(embeddingProvider: EmbeddingProvider, enabled: boolean = true) {
        this.embeddingProvider = embeddingProvider;
        this.enabled = enabled;
        
        if (enabled) {
            this.initDatabase();
        }
    }

    private initDatabase(): void {
        if (!fs.existsSync(TALON_HOME)) {
            fs.mkdirSync(TALON_HOME, { recursive: true });
        }

        this.db = new Database(VECTOR_DB_PATH);
        
        // Try to load sqlite-vec extension
        try {
            this.db.loadExtension('vec0');
        } catch (error) {
            logger.warn('sqlite-vec extension not available, vector search disabled');
            this.enabled = false;
            this.db.close();
            this.db = null;
            return;
        }

        // Create tables
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vector_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                message_id TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                role TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_session_id ON vector_messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON vector_messages(timestamp);

            CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
                message_id TEXT PRIMARY KEY,
                embedding FLOAT[1536]
            );
        `);

        logger.info('Vector memory initialized');
    }

    async addMessage(message: Message, sessionId: string): Promise<void> {
        if (!this.enabled || !this.db) return;
        if (message.role === 'tool' || message.role === 'system') return;

        try {
            const embedding = await this.embeddingProvider.embed(message.content);

            const insertMsg = this.db.prepare(`
                INSERT OR REPLACE INTO vector_messages (session_id, message_id, content, role, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `);
            insertMsg.run(sessionId, message.id, message.content, message.role, message.timestamp);

            const insertEmb = this.db.prepare(`
                INSERT OR REPLACE INTO vec_embeddings (message_id, embedding)
                VALUES (?, ?)
            `);
            insertEmb.run(message.id, Buffer.from(embedding.buffer));
        } catch (error) {
            logger.error({ error }, 'Failed to add message to vector memory');
        }
    }

    async search(query: string, options?: {
        limit?: number;
        sessionId?: string;
        daysAgo?: number;
    }): Promise<SearchResult[]> {
        if (!this.enabled || !this.db) return [];

        try {
            const limit = options?.limit ?? 10;
            const queryEmbedding = await this.embeddingProvider.embed(query);

            let sql = `
                SELECT 
                    m.message_id,
                    m.session_id,
                    m.content,
                    m.role,
                    m.timestamp,
                    vec_distance_cosine(v.embedding, ?) as distance
                FROM vec_embeddings v
                JOIN vector_messages m ON v.message_id = m.message_id
                WHERE 1=1
            `;

            const params: any[] = [Buffer.from(queryEmbedding.buffer)];

            if (options?.sessionId) {
                sql += ` AND m.session_id = ?`;
                params.push(options.sessionId);
            }

            if (options?.daysAgo) {
                const cutoff = Date.now() - (options.daysAgo * 24 * 60 * 60 * 1000);
                sql += ` AND m.timestamp > ?`;
                params.push(cutoff);
            }

            sql += ` ORDER BY distance ASC LIMIT ?`;
            params.push(limit);

            const stmt = this.db.prepare(sql);
            const rows = stmt.all(...params) as any[];

            return rows.map(row => ({
                messageId: row.message_id,
                sessionId: row.session_id,
                content: row.content,
                role: row.role,
                timestamp: row.timestamp,
                similarity: 1 - row.distance,
            }));
        } catch (error) {
            logger.error({ error }, 'Vector search failed');
            return [];
        }
    }

    cleanup(olderThanDays: number = 90): number {
        if (!this.enabled || !this.db) return 0;

        const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        const deleteMsg = this.db.prepare(`DELETE FROM vector_messages WHERE timestamp < ?`);
        const result = deleteMsg.run(cutoff);

        this.db.exec(`
            DELETE FROM vec_embeddings
            WHERE message_id NOT IN (SELECT message_id FROM vector_messages)
        `);

        return result.changes;
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

export interface EmbeddingProvider {
    embed(text: string): Promise<Float32Array>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    constructor(private apiKey: string, private model: string = 'text-embedding-3-small') {}

    async embed(text: string): Promise<Float32Array> {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                input: text.slice(0, 8000),
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI embedding failed: ${response.statusText}`);
        }

        const data = await response.json();
        return new Float32Array(data.data[0].embedding);
    }
}

export class SimpleEmbeddingProvider implements EmbeddingProvider {
    async embed(text: string): Promise<Float32Array> {
        const embedding = new Float32Array(1536);
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
        }
        for (let i = 0; i < 1536; i++) {
            embedding[i] = Math.sin(hash + i) * 0.1;
        }
        return embedding;
    }
}
