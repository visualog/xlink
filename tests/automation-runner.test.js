import test from "node:test";
import assert from "node:assert/strict";

import { createDevlogAutomationRunner } from "../src/automation-runner.js";

function makeDevlogHandoff(overrides = {}) {
  return {
    id: "handoff_2026_04_22_001",
    channel: "devlog",
    targetAgent: "devlog-agent",
    sourceAgent: "bridge-agent",
    title: "자동 sync 대상",
    status: "pending",
    priority: "medium",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    claimedAt: null,
    completedAt: null,
    claimedBy: null,
    payload: {
      type: "feature",
      title: "자동 sync 대상",
      date: "22 April, 2026",
      details: ["자동 sync 대상"],
      tags: ["devlog"]
    },
    artifacts: [],
    messages: [],
    ...overrides
  };
}

test("createDevlogAutomationRunner runOnce syncs pending devlogs and exposes status", async () => {
  const state = {
    handoffs: [makeDevlogHandoff()]
  };
  const store = {
    async list(filters = {}) {
      return state.handoffs.filter((handoff) => !filters.channel || handoff.channel === filters.channel);
    },
    async claim(id, input) {
      const handoff = state.handoffs.find((item) => item.id === id);
      handoff.status = "claimed";
      handoff.claimedBy = input.agent;
      handoff.claimedAt = "2026-04-22T10:01:00.000Z";
      return handoff;
    },
    async complete(id) {
      const handoff = state.handoffs.find((item) => item.id === id);
      handoff.status = "completed";
      handoff.completedAt = "2026-04-22T10:02:00.000Z";
      return handoff;
    }
  };
  const devlogStore = {
    async ingest(card) {
      return {
        card,
        updatedAt: "2026-04-22",
        totalEntries: 1
      };
    }
  };
  const runner = createDevlogAutomationRunner(store, devlogStore, {
    enabled: true,
    agent: "devlog-agent",
    intervalMs: 5000,
    limit: 10
  });

  const result = await runner.runOnce();
  const status = await runner.getStatus();

  assert.equal(result.syncedCount, 1);
  assert.equal(status.enabled, true);
  assert.equal(status.lastResult.syncedCount, 1);
  assert.equal(status.pendingCount, 0);
  assert.equal(status.agent, "devlog-agent");
});
