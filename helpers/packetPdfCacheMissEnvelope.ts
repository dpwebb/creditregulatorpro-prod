import { performance } from "node:perf_hooks";

export const DEFAULT_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY = 2;
export const DEFAULT_PACKET_PDF_CACHE_MISS_TIMEOUT_MS = 15_000;
export const DEFAULT_PACKET_PDF_CACHE_MISS_PENDING_LIMIT = 16;

export type PacketPdfCacheMissEnvelopeConfig = {
  maxConcurrency: number;
  timeoutMs: number;
  pendingLimit: number;
};

export type PacketPdfCacheMissEnvelopeMetrics = PacketPdfCacheMissEnvelopeConfig & {
  activeRenders: number;
  queuedWaiters: number;
  inFlightKeys: number;
  startedCount: number;
  completedCount: number;
  failedCount: number;
  timeoutCount: number;
  overloadRejectedCount: number;
  collapsedCount: number;
  maxActiveObserved: number;
  totalWaitMs: number;
  maxWaitMs: number;
};

export type PacketPdfCacheMissTaskContext = {
  signal: AbortSignal;
  isTimedOut: () => boolean;
};

type RenderWaiter = {
  queuedAt: number;
  resolve: (release: () => void) => void;
};

type InFlightEntry<T = unknown> = {
  clientPromise: Promise<T>;
  slotPromise: Promise<unknown>;
};

const state = {
  activeRenders: 0,
  waiters: [] as RenderWaiter[],
  inFlight: new Map<string, InFlightEntry>(),
  startedCount: 0,
  completedCount: 0,
  failedCount: 0,
  timeoutCount: 0,
  overloadRejectedCount: 0,
  collapsedCount: 0,
  maxActiveObserved: 0,
  totalWaitMs: 0,
  maxWaitMs: 0,
};

export class PacketPdfCacheMissOverloadedError extends Error {
  readonly code = "PACKET_PDF_CACHE_MISS_OVERLOADED";

  constructor(config: PacketPdfCacheMissEnvelopeConfig) {
    super(
      `Packet PDF cache-miss envelope overloaded: active=${state.activeRenders}, queued=${state.waiters.length}, max=${config.maxConcurrency}, pendingLimit=${config.pendingLimit}.`,
    );
    this.name = "PacketPdfCacheMissOverloadedError";
  }
}

export class PacketPdfCacheMissTimeoutError extends Error {
  readonly code = "PACKET_PDF_CACHE_MISS_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`Packet PDF cache-miss render exceeded ${timeoutMs}ms.`);
    this.name = "PacketPdfCacheMissTimeoutError";
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function getPacketPdfCacheMissEnvelopeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PacketPdfCacheMissEnvelopeConfig {
  const maxConcurrency = parsePositiveInteger(
    env.CRP_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY ?? env.PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY,
    DEFAULT_PACKET_PDF_CACHE_MISS_MAX_CONCURRENCY,
    1,
    20,
  );
  const timeoutMs = parsePositiveInteger(
    env.CRP_PACKET_PDF_CACHE_MISS_TIMEOUT_MS ?? env.PACKET_PDF_CACHE_MISS_TIMEOUT_MS,
    DEFAULT_PACKET_PDF_CACHE_MISS_TIMEOUT_MS,
    100,
    120_000,
  );
  const pendingLimit = parsePositiveInteger(
    env.CRP_PACKET_PDF_CACHE_MISS_PENDING_LIMIT ?? env.PACKET_PDF_CACHE_MISS_PENDING_LIMIT,
    Math.max(DEFAULT_PACKET_PDF_CACHE_MISS_PENDING_LIMIT, maxConcurrency),
    maxConcurrency,
    200,
  );

  return {
    maxConcurrency,
    timeoutMs,
    pendingLimit,
  };
}

export function isPacketPdfCacheMissOverloadedError(error: unknown): error is PacketPdfCacheMissOverloadedError {
  return error instanceof PacketPdfCacheMissOverloadedError;
}

export function isPacketPdfCacheMissTimeoutError(error: unknown): error is PacketPdfCacheMissTimeoutError {
  return error instanceof PacketPdfCacheMissTimeoutError;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function recordSlotAcquired(): void {
  state.maxActiveObserved = Math.max(state.maxActiveObserved, state.activeRenders);
}

async function acquireRenderSlot(config: PacketPdfCacheMissEnvelopeConfig): Promise<() => void> {
  if (state.activeRenders < config.maxConcurrency) {
    state.activeRenders += 1;
    recordSlotAcquired();
    return releaseRenderSlot;
  }

  if (state.activeRenders + state.waiters.length >= config.pendingLimit) {
    state.overloadRejectedCount += 1;
    throw new PacketPdfCacheMissOverloadedError(config);
  }

  const queuedAt = performance.now();
  return new Promise<() => void>((resolve) => {
    state.waiters.push({ queuedAt, resolve });
  });
}

function releaseRenderSlot(): void {
  const next = state.waiters.shift();
  if (next) {
    const waitMs = Math.max(0, performance.now() - next.queuedAt);
    state.totalWaitMs += waitMs;
    state.maxWaitMs = Math.max(state.maxWaitMs, waitMs);
    recordSlotAcquired();
    next.resolve(releaseRenderSlot);
    return;
  }

  state.activeRenders = Math.max(0, state.activeRenders - 1);
}

export async function withPacketPdfCacheMissTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new PacketPdfCacheMissTimeoutError(timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (timeout) clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function runBoundedPacketPdfCacheMiss<T>(
  cacheKey: string,
  task: () => Promise<T>,
  config: PacketPdfCacheMissEnvelopeConfig = getPacketPdfCacheMissEnvelopeConfig(),
): Promise<T> {
  const existing = state.inFlight.get(cacheKey) as InFlightEntry<T> | undefined;
  if (existing) {
    state.collapsedCount += 1;
    return existing.clientPromise;
  }

  const promise = runNewCacheMissTask(task, config);
  const entry: InFlightEntry<T> = {
    clientPromise: promise,
    slotPromise: promise,
  };
  state.inFlight.set(cacheKey, entry);

  try {
    return await promise;
  } finally {
    if (state.inFlight.get(cacheKey) === entry) {
      state.inFlight.delete(cacheKey);
    }
  }
}

export function runBoundedPacketPdfCacheMissWithTimeout<T>(
  cacheKey: string,
  task: (context: PacketPdfCacheMissTaskContext) => Promise<T>,
  timeoutMs: number,
  config: PacketPdfCacheMissEnvelopeConfig = getPacketPdfCacheMissEnvelopeConfig(),
  options: {
    onStarted?: () => Promise<void> | void;
  } = {},
): Promise<T> {
  const existing = state.inFlight.get(cacheKey) as InFlightEntry<T> | undefined;
  if (existing) {
    state.collapsedCount += 1;
    return existing.clientPromise;
  }

  const entry = runNewCacheMissTaskWithTimeout(task, timeoutMs, config, options);
  state.inFlight.set(cacheKey, entry);
  entry.slotPromise
    .finally(() => {
      if (state.inFlight.get(cacheKey) === entry) {
        state.inFlight.delete(cacheKey);
      }
    })
    .catch(() => undefined);

  return entry.clientPromise;
}

async function runNewCacheMissTask<T>(task: () => Promise<T>, config: PacketPdfCacheMissEnvelopeConfig): Promise<T> {
  let release: (() => void) | null = null;
  try {
    release = await acquireRenderSlot(config);
    state.startedCount += 1;
    const result = await task();
    state.completedCount += 1;
    return result;
  } catch (error) {
    state.failedCount += 1;
    if (isPacketPdfCacheMissTimeoutError(error)) {
      state.timeoutCount += 1;
    }
    throw error;
  } finally {
    release?.();
  }
}

function runNewCacheMissTaskWithTimeout<T>(
  task: (context: PacketPdfCacheMissTaskContext) => Promise<T>,
  timeoutMs: number,
  config: PacketPdfCacheMissEnvelopeConfig,
  options: {
    onStarted?: () => Promise<void> | void;
  },
): InFlightEntry<T> {
  let resolveClient!: (value: T) => void;
  let rejectClient!: (error: unknown) => void;
  let clientSettled = false;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abortController = new AbortController();

  const clientPromise = new Promise<T>((resolve, reject) => {
    resolveClient = resolve;
    rejectClient = reject;
  });

  const settleClient = (settle: () => void): void => {
    if (clientSettled) return;
    clientSettled = true;
    settle();
  };

  const slotPromise = (async () => {
    let release: (() => void) | null = null;
    try {
      release = await acquireRenderSlot(config);
      state.startedCount += 1;
      await options.onStarted?.();

      timeout = setTimeout(() => {
        timedOut = true;
        const timeoutError = new PacketPdfCacheMissTimeoutError(timeoutMs);
        abortController.abort(timeoutError);
        state.timeoutCount += 1;
        state.failedCount += 1;
        settleClient(() => rejectClient(timeoutError));
      }, timeoutMs);

      try {
        const result = await task({
          signal: abortController.signal,
          isTimedOut: () => timedOut,
        });
        if (timeout) clearTimeout(timeout);
        if (!timedOut) {
          state.completedCount += 1;
          settleClient(() => resolveClient(result));
        }
      } catch (error) {
        if (timeout) clearTimeout(timeout);
        if (!timedOut) {
          state.failedCount += 1;
          settleClient(() => rejectClient(error));
        }
      }
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      if (!clientSettled) {
        state.failedCount += 1;
        settleClient(() => rejectClient(error));
      }
    } finally {
      release?.();
    }
  })();

  slotPromise.catch(() => undefined);

  return {
    clientPromise,
    slotPromise,
  };
}

export function getPacketPdfCacheMissEnvelopeMetrics(
  config: PacketPdfCacheMissEnvelopeConfig = getPacketPdfCacheMissEnvelopeConfig(),
): PacketPdfCacheMissEnvelopeMetrics {
  return {
    ...config,
    activeRenders: state.activeRenders,
    queuedWaiters: state.waiters.length,
    inFlightKeys: state.inFlight.size,
    startedCount: state.startedCount,
    completedCount: state.completedCount,
    failedCount: state.failedCount,
    timeoutCount: state.timeoutCount,
    overloadRejectedCount: state.overloadRejectedCount,
    collapsedCount: state.collapsedCount,
    maxActiveObserved: state.maxActiveObserved,
    totalWaitMs: rounded(state.totalWaitMs),
    maxWaitMs: rounded(state.maxWaitMs),
  };
}

export function resetPacketPdfCacheMissEnvelopeForTests(): void {
  state.activeRenders = 0;
  state.waiters.length = 0;
  state.inFlight.clear();
  state.startedCount = 0;
  state.completedCount = 0;
  state.failedCount = 0;
  state.timeoutCount = 0;
  state.overloadRejectedCount = 0;
  state.collapsedCount = 0;
  state.maxActiveObserved = 0;
  state.totalWaitMs = 0;
  state.maxWaitMs = 0;
}
