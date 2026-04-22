import { toDevlogCard } from "./devlog.js";
import { StoreError } from "./store.js";

function assertAgent(agent) {
  if (typeof agent !== "string" || !agent.trim()) {
    throw new StoreError(400, "agent must be a non-empty string.");
  }

  return agent.trim();
}

function normalizeLimit(limit) {
  if (limit == null || limit === "") {
    return 20;
  }

  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new StoreError(400, "limit must be a positive number.");
  }

  return Math.min(100, Math.trunc(parsed));
}

async function resolveHandoff(store, handoffOrId) {
  if (handoffOrId && typeof handoffOrId === "object") {
    return handoffOrId;
  }

  return store.getById(handoffOrId);
}

export async function listPendingDevlogHandoffs(store) {
  return (await store.list({ channel: "devlog" })).filter((handoff) => ["pending", "claimed"].includes(handoff.status));
}

export async function buildPendingDevlogSummary(store) {
  const pending = await listPendingDevlogHandoffs(store);

  return {
    pendingCount: pending.length,
    pendingIds: pending.map((handoff) => handoff.id)
  };
}

export async function syncDevlogHandoff(store, devlogStore, handoffOrId, options = {}) {
  const agent = assertAgent(options.agent);
  const note = options.note ?? "devlog sync started";
  const resultMessage = options.result ?? "devlog card ingested and handoff completed";

  let handoff = await resolveHandoff(store, handoffOrId);

  if (handoff.channel !== "devlog") {
    throw new StoreError(409, `handoff ${handoff.id} is not a devlog handoff.`);
  }

  if (handoff.status === "pending") {
    handoff = await store.claim(handoff.id, { agent, note });
  }

  if (!["claimed", "completed"].includes(handoff.status)) {
    throw new StoreError(409, `handoff ${handoff.id} cannot be synced from status ${handoff.status}.`);
  }

  const card = toDevlogCard(handoff);
  const ingest = await devlogStore.ingest(card);
  const completed =
    handoff.status === "completed" ? handoff : await store.complete(handoff.id, { agent, result: resultMessage });

  return {
    handoff: completed,
    ingest
  };
}

export async function syncPendingDevlogHandoffs(store, devlogStore, options = {}) {
  const agent = assertAgent(options.agent);
  const note = options.note ?? "devlog sync started";
  const result = options.result ?? "devlog card ingested and handoff completed";
  const limit = normalizeLimit(options.limit);
  const candidates = (await listPendingDevlogHandoffs(store)).slice(0, limit);

  const synced = [];
  const failed = [];

  for (const handoff of candidates) {
    try {
      const output = await syncDevlogHandoff(store, devlogStore, handoff, { agent, note, result });
      synced.push({
        id: output.handoff.id,
        status: output.handoff.status,
        ingestUpdatedAt: output.ingest.updatedAt ?? null,
        totalEntries: output.ingest.totalEntries ?? null
      });
    } catch (error) {
      failed.push({
        id: handoff.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const remaining = (await listPendingDevlogHandoffs(store)).length;

  return {
    agent,
    limit,
    scanned: candidates.length,
    syncedCount: synced.length,
    failedCount: failed.length,
    remainingPending: remaining,
    synced,
    failed
  };
}
