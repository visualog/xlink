import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createHandoffRoutes } from "../src/routes/handoffs.js";

function makeHandoff() {
  return {
    id: "handoff_2026_04_07_001",
    channel: "bridge",
    targetAgent: "alpha-agent",
    sourceAgent: "bridge-agent",
    title: "Check current frame",
    status: "claimed",
    priority: "medium",
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:12:00.000Z",
    claimedAt: "2026-04-07T00:05:00.000Z",
    completedAt: null,
    claimedBy: "alpha-agent",
    payload: {},
    artifacts: [
      {
        type: "file",
        path: "./bridge/final.json",
        label: "final",
        createdAt: "2026-04-07T00:11:30.000Z"
      }
    ],
    messages: [
      { author: "bridge-agent", body: "Please inspect this frame.", kind: "note", createdAt: "2026-04-07T00:01:00.000Z" },
      { author: "alpha-agent", body: "On it.", kind: "reply", createdAt: "2026-04-07T00:06:00.000Z" },
      { author: "alpha-agent", body: "Done.", kind: "reply", createdAt: "2026-04-07T00:11:00.000Z" }
    ]
  };
}

function makeResponseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writes: [],
    writableEnded: false,
    writeHead(statusCode) {
      this.statusCode = statusCode;
      this.headers = arguments[1] ?? null;
    },
    write(chunk) {
      this.writes.push(String(chunk));
    },
    end(body = "") {
      this.body = body;
      this.writableEnded = true;
    }
  };
}

function parseResponseJson(response) {
  return JSON.parse(response.body);
}

test("GET /handoffs/:id/conversation forwards after query for delta snapshot", async () => {
  const store = {
    async getById() {
      return makeHandoff();
    }
  };
  const route = createHandoffRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation?after=2026-04-07T00:06:30.000Z");

  const handled = await route({ method: "GET" }, response, url, ["handoffs", "handoff_2026_04_07_001", "conversation"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].body, "Done.");
  assert.equal(payload.delta.after, "2026-04-07T00:06:30.000Z");
});

test("GET /handoffs/:id/conversation/stream emits ready and conversation events", async () => {
  const store = {
    async getById() {
      return makeHandoff();
    }
  };
  const route = createHandoffRoutes(store);
  const response = makeResponseCapture();
  const request = new EventEmitter();
  request.method = "GET";
  const url = new URL(
    "http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation/stream?after=2026-04-07T00:06:30.000Z&interval=1"
  );

  const handled = await route(request, response, url, ["handoffs", "handoff_2026_04_07_001", "conversation", "stream"]);
  request.emit("close");

  const streamText = response.writes.join("");
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(streamText.includes("event: ready"), true);
  assert.equal(streamText.includes("event: conversation"), true);
});

test("GET /handoffs/:id/conversation supports since alias", async () => {
  const store = {
    async getById() {
      return makeHandoff();
    }
  };
  const route = createHandoffRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation?since=2026-04-07T00:06:30.000Z");

  const handled = await route({ method: "GET" }, response, url, ["handoffs", "handoff_2026_04_07_001", "conversation"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].body, "Done.");
  assert.equal(payload.delta.after, "2026-04-07T00:06:30.000Z");
});

test("GET /handoffs/:id/conversation prefers linked thread messages when present", async () => {
  const store = {
    async getById() {
      return {
        ...makeHandoff(),
        threadId: "thread_2026_04_22_001"
      };
    },
    async getThreadById() {
      return {
        id: "thread_2026_04_22_001",
        channel: "bridge",
        sourceAgent: "bridge-agent",
        targetAgent: "alpha-agent",
        title: "Check current frame",
        status: "open",
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:13:00.000Z",
        handoffIds: ["handoff_2026_04_07_001"],
        messages: [
          {
            author: "bridge-agent",
            body: "Thread-level follow-up",
            kind: "question",
            createdAt: "2026-04-07T00:13:00.000Z"
          }
        ]
      };
    }
  };
  const route = createHandoffRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation");

  const handled = await route({ method: "GET" }, response, url, ["handoffs", "handoff_2026_04_07_001", "conversation"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.handoff.threadId, "thread_2026_04_22_001");
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].body, "Thread-level follow-up");
});

test("POST /handoffs/:id/devlog-sync ingests before completing the handoff", async () => {
  const calls = [];
  const claimed = {
    ...makeHandoff(),
    id: "handoff_2026_04_07_009",
    channel: "devlog",
    status: "claimed",
    title: "Toolbar filter 작업 devlog 등록",
    payload: {
      type: "feature",
      title: "Toolbar filter 작업 devlog 등록",
      date: "07 April, 2026",
      details: ["Toolbar filter 작업 devlog 등록"],
      tags: ["devlog"]
    }
  };
  const completed = {
    ...claimed,
    status: "completed",
    completedAt: "2026-04-07T00:13:00.000Z"
  };
  const store = {
    async getById() {
      calls.push("getById");
      return claimed;
    },
    async complete() {
      calls.push("complete");
      return completed;
    }
  };
  const devlogStore = {
    async ingest(card) {
      calls.push(`ingest:${card.id}`);
      return { card, updatedAt: "2026-04-07", totalEntries: 3 };
    }
  };
  const route = createHandoffRoutes(store, { devlogStore });
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ agent: "devlog-agent" }), "utf8");
    }
  };
  const url = new URL("http://127.0.0.1:3850/handoffs/handoff_2026_04_07_009/devlog-sync");

  const handled = await route(request, response, url, ["handoffs", "handoff_2026_04_07_009", "devlog-sync"]);
  const payload = parseResponseJson(response);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, ["getById", "ingest:handoff-2026-04-07-009", "complete"]);
  assert.equal(payload.handoff.status, "completed");
  assert.equal(payload.ingest.totalEntries, 3);
});
