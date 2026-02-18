export type MemorySource = 'memory' | 'sessions';

export type FileEntry = {
  path: string; // Relative path
  absPath: string; // Absolute path
  source: MemorySource;
  hash: string;
  mtimeMs: number;
  size: number;
  content: string;
};

export type ChunkEntry = {
  id: string;
  filePath: string;
  source: MemorySource;
  startLine: number;
  endLine: number;
  text: string;
  tokens: number;
};

export type ChunkingConfig = {
  tokens: number; // Target chunk size
  overlap: number; // Overlap in tokens
};
