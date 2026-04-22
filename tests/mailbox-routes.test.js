import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createMailboxRoutes } from "../src/routes/mailbox.js";

function makeHandoff(overrides = {}) {
  return {
    id: "handoff_2026_04_07_001",
    threadId: "thread_2026_04_07_001",
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
    artifacts: [],
    messages: []
  };
}

function makeThread(overrides = {}) {
  return {
    id: "thread_2026_04_07_001",
    channel: "bridge",
    targetAgent: "alpha-agent",
    sourceAgent: "bridge-agent",
    title: "Check current frame",
    status: "open",
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:15:00.000Z",
    handoffIds: ["handoff_2026_04_07_001"],
    messages: [
      { author: "alpha-agent", body: "Thread-level update.", kind: "reply", createdAt: "2026-04-07T00:15:00.000Z" }
    ],
    ...overrides
  };
}

function makeResponseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writes: [],
    writableEnded: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    write(chunk) {
      this.writes.push(String(chunk));
    },
    end(body = "") {
      if (body) {
        this.body += body;
      }
      this.writableEnded = true;
    }
  };
}

test("GET /mailbox returns snapshot payload", async () => {
  const store = {
    async list() {
      return [makeHandoff()];
    },
    async listThreads() {
      return [makeThread()];
    },
    async getMailboxReadState() {
      return { agent: "alpha-agent", lastReadAt: "2026-04-07T00:01:00.000Z", updatedAt: "2026-04-07T00:01:00.000Z" };
    }
  };
  const route = createMailboxRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/mailbox?agent=alpha-agent");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mailbox.agent, "alpha-agent");
  assert.equal(payload.mailbox.cursor, "2026-04-07T00:15:00.000Z");
  assert.equal(payload.threads.length, 1);
  assert.equal(payload.threads[0].id, "thread_2026_04_07_001");
  assert.equal(payload.handoffs.length, 1);
});

test("GET /mailbox/stream emits ready and mailbox events", async () => {
  const store = {
    async list() {
      return [makeHandoff()];
    },
    async listThreads() {
      return [makeThread()];
    },
    async getMailboxReadState() {
      return { agent: "alpha-agent", lastReadAt: null, updatedAt: null };
    }
  };
  const route = createMailboxRoutes(store);
  const response = makeResponseCapture();
  const request = new EventEmitter();
  request.method = "GET";
  const url = new URL("http://127.0.0.1:3850/mailbox/stream?agent=alpha-agent&interval=1");

  const handled = await route(request, response, url);
  request.emit("close");

  const streamText = response.writes.join("");
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(streamText.includes("event: ready"), true);
  assert.equal(streamText.includes("event: mailbox"), true);
});

test("GET /mailbox/:agent/unread-count returns unread summary", async () => {
  const store = {
    async list() {
      return [
        makeHandoff(),
        makeHandoff({
          id: "handoff_2026_04_07_002",
          updatedAt: "2026-04-07T00:13:00.000Z"
        })
      ];
    },
    async listThreads() {
      return [
        makeThread({
          handoffIds: ["handoff_2026_04_07_001", "handoff_2026_04_07_002"]
        })
      ];
    },
    async getMailboxReadState() {
      return { agent: "alpha-agent", lastReadAt: "2026-04-07T00:01:00.000Z", updatedAt: "2026-04-07T00:01:00.000Z" };
    }
  };
  const route = createMailboxRoutes(store);
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/mailbox/alpha-agent/unread-count");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.agent, "alpha-agent");
  assert.equal(payload.unreadCount, 1);
  assert.deepEqual(payload.threadIds, ["thread_2026_04_07_001"]);
  assert.deepEqual(payload.handoffIds, ["handoff_2026_04_07_001", "handoff_2026_04_07_002"]);
});

test("POST /mailbox/:agent/ack stores cursor and returns unread count", async () => {
  const chunks = [Buffer.from(JSON.stringify({ cursor: "2026-04-07T00:15:00.000Z" }), "utf8")];
  const store = {
    async list() {
      return [makeHandoff()];
    },
    async listThreads() {
      return [makeThread()];
    },
    async getMailboxReadState() {
      return { agent: "alpha-agent", lastReadAt: "2026-04-07T00:15:00.000Z", updatedAt: "2026-04-07T00:15:00.000Z" };
    },
    async ackMailbox(agent, body) {
      return { agent, lastReadAt: body.cursor, updatedAt: body.cursor };
    }
  };
  const route = createMailboxRoutes(store);
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
  const url = new URL("http://127.0.0.1:3850/mailbox/alpha-agent/ack");

  const handled = await route(request, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.ack.lastReadAt, "2026-04-07T00:15:00.000Z");
  assert.equal(payload.unreadCount, 0);
});

test("GET /mailbox/:agent/unread-count supports thread-scoped unread state", async () => {
  const store = {
    async list() {
      return [
        makeHandoff({
          id: "handoff_2026_04_07_001",
          threadId: "thread_2026_04_07_001",
          updatedAt: "2026-04-07T00:12:00.000Z"
        }),
        makeHandoff({
          id: "handoff_2026_04_07_002",
          threadId: "thread_2026_04_07_002",
          updatedAt: "2026-04-07T00:13:00.000Z"
        })
      ];
    },
    async listThreads() {
      return [
        makeThread({
          id: "thread_2026_04_07_001",
          updatedAt: "2026-04-07T00:12:00.000Z",
          handoffIds: ["handoff_2026_04_07_001"],
          messages: []
        }),
        makeThread({
          id: "thread_2026_04_07_002",
          updatedAt: "2026-04-07T00:13:00.000Z",
          handoffIds: ["handoff_2026_04_07_002"],
          messages: []
        })
      ];
    },
    async getMailboxReadState() {
      return {
        agent: "alpha-agent",
        threadId: "thread_2026_04_07_001",
        lastReadAt: "2026-04-07T00:12:30.000Z",
        globalLastReadAt: "2026-04-07T00:10:00.000Z",
        threadLastReadAt: "2026-04-07T00:12:30.000Z",
        updatedAt: "2026-04-07T00:12:30.000Z"
      };
    },
    async listMailboxReadStates() {
      return [{ agent: "alpha-agent", threadId: "thread_2026_04_07_001", lastReadAt: "2026-04-07T00:12:30.000Z" }];
    }
  };
  const route = createMailboxRoutes(store);
  const response = makeResponseCapture();
  const url = new URL(
    "http://127.0.0.1:3850/mailbox/alpha-agent/unread-count?threadId=thread_2026_04_07_001"
  );

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.unreadCount, 0);
  assert.equal(payload.threadId, "thread_2026_04_07_001");
  assert.deepEqual(payload.threadIds, []);
});

test("POST /mailbox/:agent/ack returns thread-scoped ack details", async () => {
  const chunks = [
    Buffer.from(JSON.stringify({ cursor: "2026-04-07T00:15:00.000Z", threadId: "thread_2026_04_07_001" }), "utf8")
  ];
  const store = {
    async list() {
      return [makeHandoff()];
    },
    async listThreads() {
      return [makeThread()];
    },
    async getMailboxReadState() {
      return {
        agent: "alpha-agent",
        threadId: "thread_2026_04_07_001",
        lastReadAt: "2026-04-07T00:15:00.000Z",
        globalLastReadAt: "2026-04-07T00:10:00.000Z",
        threadLastReadAt: "2026-04-07T00:15:00.000Z",
        updatedAt: "2026-04-07T00:15:00.000Z"
      };
    },
    async listMailboxReadStates() {
      return [{ agent: "alpha-agent", threadId: "thread_2026_04_07_001", lastReadAt: "2026-04-07T00:15:00.000Z" }];
    },
    async ackMailbox(agent, body) {
      return {
        agent,
        threadId: body.threadId,
        lastReadAt: body.cursor,
        globalLastReadAt: "2026-04-07T00:10:00.000Z",
        threadLastReadAt: body.cursor,
        updatedAt: body.cursor
      };
    }
  };
  const route = createMailboxRoutes(store);
  const response = makeResponseCapture();
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
  const url = new URL("http://127.0.0.1:3850/mailbox/alpha-agent/ack?threadId=thread_2026_04_07_001");

  const handled = await route(request, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ack.threadId, "thread_2026_04_07_001");
  assert.equal(payload.threadId, "thread_2026_04_07_001");
});
