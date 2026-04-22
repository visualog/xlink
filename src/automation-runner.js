import { buildPendingDevlogSummary, syncPendingDevlogHandoffs } from "./devlog-sync.js";

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

export function createDevlogAutomationRunner(store, devlogStore, options = {}) {
  const enabled = options.enabled === true;
  const agent = String(options.agent || "devlog-agent").trim();
  const intervalMs = normalizePositiveInteger(options.intervalMs, 60000);
  const limit = normalizePositiveInteger(options.limit, 20);
  const note = options.note ?? "devlog sync started";
  const result = options.result ?? "devlog card ingested and handoff completed";

  let timer = null;
  let active = false;
  let lastStartedAt = null;
  let lastFinishedAt = null;
  let lastResult = null;
  let lastError = null;

  async function runOnce() {
    if (active) {
      return lastResult;
    }

    active = true;
    lastStartedAt = new Date().toISOString();
    lastError = null;

    try {
      const summary = await syncPendingDevlogHandoffs(store, devlogStore, {
        agent,
        limit,
        note,
        result
      });
      lastResult = summary;
      lastFinishedAt = new Date().toISOString();
      return summary;
    } catch (error) {
      lastFinishedAt = new Date().toISOString();
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      active = false;
    }
  }

  async function getStatus() {
    const pending = await buildPendingDevlogSummary(store);

    return {
      enabled,
      active,
      agent,
      intervalMs,
      limit,
      lastStartedAt,
      lastFinishedAt,
      lastResult,
      lastError,
      ...pending
    };
  }

  function start() {
    if (!enabled || timer) {
      return;
    }

    timer = setInterval(() => {
      runOnce().catch(() => {
        // Errors are retained in status for later inspection.
      });
    }, intervalMs);
  }

  function stop() {
    if (!timer) {
      return;
    }

    clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    runOnce,
    getStatus
  };
}
