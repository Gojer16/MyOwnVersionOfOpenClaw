// ─── Shadow Loop Types ────────────────────────────────────────────

export interface WatchEvent {
    type: 'add' | 'change' | 'unlink';
    path: string;
    timestamp: number;
}

export interface GhostMessage {
    message: string;
    context: Record<string, unknown>;
    priority: 'low' | 'medium' | 'high';
}

export interface Heuristic {
    name: string;
    test: (event: WatchEvent) => boolean;
    generate: (event: WatchEvent) => GhostMessage | null;
}

export interface WatcherConfig {
    paths: string[];
    ignored?: string[];
    enabled?: boolean;
}
