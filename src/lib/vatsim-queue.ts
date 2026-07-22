/**
 * Global scheduler for VATSIM API calls.
 *
 * VATSIM rate-limits to ~10 requests per minute, which is shared across
 * everything this server does. Background work (roster reports) can easily
 * starve interactive page loads, so all VATSIM calls go through this queue:
 *
 *  - "high" (interactive: a user loading their dashboard) may use the full
 *    budget and is always dequeued before background work.
 *  - "low" (background: roster report jobs) may only use part of the budget,
 *    leaving headroom reserved for interactive requests.
 *
 * Tasks run one at a time, so a newly-arrived interactive request waits at most
 * for the in-flight call plus a slot.
 */

export type Priority = "high" | "low";

/** Stay comfortably under VATSIM's ~10/min limit. */
const MAX_PER_WINDOW = 8;
/** Background work may only consume this many of the slots per window. */
const BACKGROUND_MAX = 5;
const WINDOW_MS = 60_000;

interface Task {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const highQueue: Task[] = [];
const lowQueue: Task[] = [];
/** Timestamps of recently-issued requests (rolling window). */
const issued: number[] = [];
let pumping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function prune(now: number): void {
  while (issued.length && now - issued[0] > WINDOW_MS) issued.shift();
}

/** Queue a VATSIM request. Resolves with the callback's result. */
export function scheduleVatsim<T>(
  fn: () => Promise<T>,
  priority: Priority = "high",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const task: Task = {
      run: fn as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    };
    (priority === "high" ? highQueue : lowQueue).push(task);
    void pump();
  });
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (highQueue.length || lowQueue.length) {
      prune(Date.now());

      // Re-evaluate priority every tick so an interactive request that arrives
      // mid-wait is picked up as soon as a slot frees.
      const takingHigh = highQueue.length > 0;
      const limit = takingHigh ? MAX_PER_WINDOW : BACKGROUND_MAX;

      if (issued.length >= limit) {
        await sleep(500);
        continue;
      }

      const task = highQueue.shift() ?? lowQueue.shift();
      if (!task) continue;

      issued.push(Date.now());
      try {
        task.resolve(await task.run());
      } catch (err) {
        task.reject(err);
      }
    }
  } finally {
    pumping = false;
  }
}

/** Snapshot of queue state, for progress/debug display. */
export function queueStats(): {
  high: number;
  low: number;
  usedInWindow: number;
  maxPerWindow: number;
  backgroundMax: number;
} {
  prune(Date.now());
  return {
    high: highQueue.length,
    low: lowQueue.length,
    usedInWindow: issued.length,
    maxPerWindow: MAX_PER_WINDOW,
    backgroundMax: BACKGROUND_MAX,
  };
}
