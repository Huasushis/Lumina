import fs from 'node:fs';
import path from 'node:path';
import {
  DebugConfig,
  DebugEvent,
  DebugLevel,
  DebugLoggerLike,
  DebugSink
} from './types.js';

const LEVEL_WEIGHT: Record<DebugLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

function trimLongStrings(value: unknown, maxFieldLength: number): unknown {
  if (typeof value === 'string') {
    if (value.length <= maxFieldLength) {
      return value;
    }
    return `${value.slice(0, maxFieldLength)}...<trimmed ${value.length - maxFieldLength} chars>`;
  }

  if (Array.isArray(value)) {
    return value.map((v) => trimLongStrings(v, maxFieldLength));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = trimLongStrings(v, maxFieldLength);
    }
    return result;
  }

  return value;
}

export class ConsoleDebugSink implements DebugSink {
  log(event: DebugEvent): void {
    const message = `[LuminaDebug] ${JSON.stringify(event)}`;
    if (event.level === 'error') {
      console.error(message);
      return;
    }
    if (event.level === 'warn') {
      console.warn(message);
      return;
    }
    console.log(message);
  }
}

export class FileDebugSink implements DebugSink {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const folder = path.dirname(filePath);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  }

  log(event: DebugEvent): void {
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }
}

export class MemoryDebugSink implements DebugSink {
  private events: DebugEvent[] = [];
  private readonly limit: number;

  constructor(limit = 500) {
    this.limit = Math.max(1, limit);
  }

  log(event: DebugEvent): void {
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events.shift();
    }
  }

  getEvents(): DebugEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

class NoopDebugLogger implements DebugLoggerLike {
  emit(_: Omit<DebugEvent, 'timestamp'>): void {
    // no-op
  }
}

export const noopDebugLogger = new NoopDebugLogger();

export class DebugLogger implements DebugLoggerLike {
  private readonly enabled: boolean;
  private readonly threshold: DebugLevel;
  private readonly maxFieldLength: number;
  private readonly sinks: DebugSink[];
  private readonly memorySink?: MemoryDebugSink;

  constructor(config?: DebugConfig) {
    this.enabled = Boolean(config?.enabled);
    this.threshold = config?.level ?? 'info';
    this.maxFieldLength = config?.maxFieldLength ?? 4000;

    if (!this.enabled) {
      this.sinks = [];
      return;
    }

    const sinks: DebugSink[] = [];

    if (config?.sink) {
      sinks.push(config.sink);
    }

    if (config?.filePath) {
      sinks.push(new FileDebugSink(config.filePath));
    }

    if (config?.memoryLimit && config.memoryLimit > 0) {
      this.memorySink = new MemoryDebugSink(config.memoryLimit);
      sinks.push(this.memorySink);
    }

    if (config?.mirrorToConsole !== false || sinks.length === 0) {
      sinks.push(new ConsoleDebugSink());
    }

    this.sinks = sinks;
  }

  emit(event: Omit<DebugEvent, 'timestamp'>): void {
    if (!this.enabled) {
      return;
    }

    if (LEVEL_WEIGHT[event.level] < LEVEL_WEIGHT[this.threshold]) {
      return;
    }

    const finalEvent: DebugEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      payload: trimLongStrings(event.payload, this.maxFieldLength)
    };

    for (const sink of this.sinks) {
      try {
        sink.log(finalEvent);
      } catch (err) {
        // Logging failures should never break runtime logic.
        console.warn('[LuminaDebug] sink failure:', err);
      }
    }
  }

  getMemoryEvents(): DebugEvent[] {
    return this.memorySink?.getEvents() ?? [];
  }
}
