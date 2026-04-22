import test from "node:test";
import assert from "node:assert/strict";

import { createAutomationRoutes } from "../src/routes/automation.js";

function makeDevlogHandoff(overrides = {}) {
  return {
    id: "handoff_2026_04_22_001",
    channel: "devlog",
    targetAgent: "devlog-agent",
    sourceAgent: "bridge-agent",
    title: "Toolbar filter 작업 devlog 등록",
    status: "pending",
    priority: "medium",
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    claimedAt: null,
    completedAt: null,
    claimedBy: null,
    payload: {
      type: "feature",
      title: "Toolbar filter 작업 devlog 등록",
      date: "22 April, 2026",
      details: ["Toolbar filter 작업 devlog 등록"],
      tags: ["devlog"]
    },
    artifacts: [],
    messages: [],
    ...overrides
  };
}

function makeResponseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    }
  };
}

test("POST /automation/devlog/sync-pending bulk-syncs pending devlogs", async () => {
  const state = {
    handoffs: [
      makeDevlogHandoff(),
      makeDevlogHandoff({
        id: "handoff_2026_04_22_002",
        status: "claimed",
        claimedAt: "2026-04-22T10:01:00.000Z",
        claimedBy: "devlog-agent"
      })
    ]
  };
  const store = {
    async list(filters = {}) {
      return state.handoffs.filter((handoff) => !filters.channel || handoff.channel === filters.channel);
    },
    async claim(id, input) {
      const handoff = state.handoffs.find((item) => item.id === id);
      handoff.status = "claimed";
      handoff.claimedAt = "2026-04-22T10:02:00.000Z";
      handoff.claimedBy = input.agent;
      return handoff;
    },
    async complete(id, input) {
      const handoff = state.handoffs.find((item) => item.id === id);
      handoff.status = "completed";
      handoff.completedAt = "2026-04-22T10:03:00.000Z";
      handoff.updatedAt = "2026-04-22T10:03:00.000Z";
      handoff.messages.push({
        author: input.agent,
        body: input.result,
        kind: "result",
        createdAt: "2026-04-22T10:03:00.000Z"
      });
      return handoff;
    }
  };
  const devlogStore = {
    async ingest(card) {
      return {
        card,
        updatedAt: "2026-04-22",
        totalEntries: 2
      };
    }
  };
  const route = createAutomationRoutes(store, { devlogStore });
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ agent: "devlog-agent", limit: 10 }), "utf8");
    }
  };
  const url = new URL("http://127.0.0.1:3850/automation/devlog/sync-pending");

  const handled = await route(request, response, url, ["automation", "devlog", "sync-pending"]);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.syncedCount, 2);
  assert.equal(payload.failedCount, 0);
  assert.equal(payload.remainingPending, 0);
  assert.equal(payload.synced[0].status, "completed");
});

test("GET /automation/devlog/status returns runner status snapshot", async () => {
  const route = createAutomationRoutes(
    {},
    {
      devlogRunner: {
        async getStatus() {
          return {
            enabled: true,
            active: false,
            agent: "devlog-agent",
            intervalMs: 60000,
            limit: 20,
            lastStartedAt: "2026-04-22T10:00:00.000Z",
            lastFinishedAt: "2026-04-22T10:00:01.000Z",
            lastResult: { syncedCount: 2 },
            lastError: null,
            pendingCount: 1,
            pendingIds: ["handoff_2026_04_22_003"]
          };
        }
      }
    }
  );
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/automation/devlog/status");

  const handled = await route({ method: "GET" }, response, url, ["automation", "devlog", "status"]);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.enabled, true);
  assert.equal(payload.agent, "devlog-agent");
  assert.equal(payload.pendingCount, 1);
});
