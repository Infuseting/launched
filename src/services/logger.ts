import { invoke } from '@tauri-apps/api/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogBridgeFn = (
  level: LogLevel,
  target: string,
  message: string,
) => void;

declare global {
  var __launchedLogBridge: LogBridgeFn | undefined;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n${error.stack}` : error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function sendLogToBackend(
  level: LogLevel,
  target: string,
  message: string,
): void {
  try {
    const result = invoke('log_frontend', { level, target, message });
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Ignore when running outside Tauri (e.g. unit tests or browser preview)
  }
}

export function installGlobalLogBridge(): void {
  globalThis.__launchedLogBridge = sendLogToBackend;
}

export function createLogger(target: string) {
  const write = (level: LogLevel, message: string, error?: unknown) => {
    const fullMessage =
      error !== undefined ? `${message}: ${formatError(error)}` : message;
    if (level === 'error') {
      console.error(`[${target}] ${fullMessage}`);
    } else if (level === 'warn') {
      console.warn(`[${target}] ${fullMessage}`);
    } else if (level === 'debug') {
      console.debug(`[${target}] ${fullMessage}`);
    } else {
      console.info(`[${target}] ${fullMessage}`);
    }
    sendLogToBackend(level, target, fullMessage);
  };

  return {
    debug: (message: string, error?: unknown) => write('debug', message, error),
    info: (message: string, error?: unknown) => write('info', message, error),
    warn: (message: string, error?: unknown) => write('warn', message, error),
    error: (message: string, error?: unknown) => write('error', message, error),
  };
}
