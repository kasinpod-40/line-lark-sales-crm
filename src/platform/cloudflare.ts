export interface D1ResultMeta {
  changes?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = unknown> {
  success: boolean;
  meta: D1ResultMeta;
  results?: T[];
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1Result>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface QueueSendOptions {
  contentType?: "json" | "text" | "bytes" | "v8";
  delaySeconds?: number;
}

export interface QueueProducer<T> {
  send(body: T, options?: QueueSendOptions): Promise<void>;
}

export interface QueueMessage<T> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatch<T> {
  readonly queue: string;
  readonly messages: QueueMessage<T>[];
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface WorkersAI {
  run(model: string, input: unknown): Promise<unknown>;
}
