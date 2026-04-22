import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildConversationSnapshot,
  buildMailboxSnapshot,
  summarizeConversation
} from "../src/mailbox.js";
import { JsonHandoffStore, SqliteHandoffStore } from "../src/store.js";

function makeHandoff(overrides = {}) {
  return {
    id: "handoff_2026_04_07_001",
    channel: "bridge",
    targetAgent: "alpha-agent",
    sourceAgent: "bridge-agent",
    title: "Check current frame",
    status: "claimed",
    priority: "medium",
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:10:00.000Z",
    claimedAt: "2026-04-07T00:05:00.000Z",
    completedAt: null,
    claimedBy: "alpha-agent",
    payload: {
      type: "feature",
      title: "Check current frame",
      date: "07 April, 2026",
      summary: "Inspect the current frame",
      details: ["Inspect the current frame"],
      tags: ["mailbox"]
    },
    artifacts: [],
    messages: [
      { author: "bridge-agent", body: "Please inspect this frame.", kind: "note", createdAt: "2026-04-07T00:01:00.000Z" },
      { author: "alpha-agent", body: "On it.", kind: "reply", createdAt: "2026-04-07T00:06:00.000Z" }
    ],
    ...overrides
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
    updatedAt: "2026-04-07T00:10:00.000Z",
    handoffIds: ["handoff_2026_04_07_001"],
    messages: [
      { author: "bridge-agent", body: "Please inspect this frame.", kind: "note", createdAt: "2026-04-07T00:01:00.000Z" },
      { author: "alpha-agent", body: "On it.", kind: "reply", createdAt: "2026-04-07T00:06:00.000Z" }
    ],
    ...overrides
  };
}

test("summarizeConversation exposes conversation state", () => {
  const summary = summarizeConversation(makeHandoff());

  assert.equal(summary.messageCount, 2);
  assert.equal(summary.lastMessage.body, "On it.");
  assert.equal(summary.participants.includes("bridge-agent"), true);
  assert.equal(summary.participants.includes("alpha-agent"), true);
  assert.equal(summary.updatedAt, "2026-04-07T00:10:00.000Z");
});

test("buildMailboxSnapshot filters by agent and updatedSince", () => {
  const snapshot = buildMailboxSnapshot(
    {
      handoffs: [
        makeHandoff({ threadId: "thread_2026_04_07_001" }),
        makeHandoff({
          id: "handoff_2026_04_07_002",
          threadId: "thread_2026_04_07_002",
          targetAgent: "beta-agent",
          claimedBy: "beta-agent",
          updatedAt: "2026-04-07T00:20:00.000Z"
        }),
        makeHandoff({
          id: "handoff_2026_04_07_003",
          threadId: "thread_2026_04_07_003",
          status: "completed",
          updatedAt: "2026-04-06T23:59:00.000Z"
        })
      ],
      threads: [
        makeThread({
          updatedAt: "2026-04-07T00:12:00.000Z",
          messages: [
            { author: "bridge-agent", body: "Please inspect this frame.", kind: "note", createdAt: "2026-04-07T00:01:00.000Z" },
            { author: "alpha-agent", body: "On it.", kind: "reply", createdAt: "2026-04-07T00:06:00.000Z" },
            { author: "alpha-agent", body: "Thread-level update.", kind: "reply", createdAt: "2026-04-07T00:12:00.000Z" }
          ]
        }),
        makeThread({
          id: "thread_2026_04_07_002",
          targetAgent: "beta-agent",
          updatedAt: "2026-04-07T00:20:00.000Z",
          handoffIds: ["handoff_2026_04_07_002"]
        }),
        makeThread({
          id: "thread_2026_04_07_003",
          updatedAt: "2026-04-06T23:59:00.000Z",
          handoffIds: ["handoff_2026_04_07_003"],
          messages: []
        })
      ]
    },
    {
      agent: "alpha-agent",
      after: "2026-04-07T00:02:00.000Z",
      lastReadAt: "2026-04-07T00:09:00.000Z"
    }
  );

  assert.equal(snapshot.mailbox.total, 2);
  assert.equal(snapshot.mailbox.handoffTotal, 1);
  assert.equal(snapshot.mailbox.unreadCount, 1);
  assert.equal(snapshot.threads[0].id, "thread_2026_04_07_001");
  assert.equal(snapshot.threads[1].id, "thread_2026_04_07_003");
  assert.equal(snapshot.threads[1].status, "completed");
  assert.equal(snapshot.handoffs[0].id, "handoff_2026_04_07_001");
  assert.equal(snapshot.handoffs[0].unread, true);
  assert.equal(snapshot.threads[0].unread, true);
  assert.equal(snapshot.mailbox.nextAfter, "2026-04-07T00:12:00.000Z");
  assert.equal(snapshot.mailbox.cursor, "2026-04-07T00:12:00.000Z");
});

test("buildMailboxSnapshot collapses unread counts by thread and uses latest thread activity for cursor", () => {
  const snapshot = buildMailboxSnapshot(
    {
      handoffs: [
        makeHandoff({
          id: "handoff_unread_a",
          threadId: "thread_unread",
          updatedAt: "2026-04-07T00:17:00.000Z"
        }),
        makeHandoff({
          id: "handoff_unread_b",
          threadId: "thread_unread",
          updatedAt: "2026-04-07T00:18:00.000Z"
        }),
        makeHandoff({
          id: "handoff_read",
          threadId: "thread_read",
          updatedAt: "2026-04-07T00:19:00.000Z"
        })
      ],
      threads: [
        makeThread({
          id: "thread_unread",
          updatedAt: "2026-04-07T00:21:00.000Z",
          handoffIds: ["handoff_unread_a", "handoff_unread_b"]
        }),
        makeThread({
          id: "thread_read",
          updatedAt: "2026-04-07T00:20:00.000Z",
          handoffIds: ["handoff_read"]
        })
      ]
    },
    {
      agent: "alpha-agent",
      lastReadAt: "2026-04-07T00:20:30.000Z"
    }
  );

  assert.equal(snapshot.threads[0].id, "thread_unread");
  assert.equal(snapshot.threads[0].unread, true);
  assert.equal(snapshot.threads[1].id, "thread_read");
  assert.equal(snapshot.threads[1].unread, false);
  assert.equal(snapshot.mailbox.unreadCount, 1);
  assert.equal(snapshot.mailbox.total, 2);
  assert.equal(snapshot.mailbox.handoffTotal, 3);
  assert.equal(snapshot.mailbox.cursor, "2026-04-07T00:21:00.000Z");
});

test("buildMailboxSnapshot uses per-thread read cursors on top of the global cursor", () => {
  const snapshot = buildMailboxSnapshot(
    {
      handoffs: [
        makeHandoff({
          id: "handoff_thread_a",
          threadId: "thread_a",
          updatedAt: "2026-04-07T00:11:00.000Z"
        }),
        makeHandoff({
          id: "handoff_thread_b",
          threadId: "thread_b",
          updatedAt: "2026-04-07T00:13:00.000Z"
        })
      ],
      threads: [
        makeThread({
          id: "thread_a",
          updatedAt: "2026-04-07T00:12:00.000Z",
          handoffIds: ["handoff_thread_a"]
        }),
        makeThread({
          id: "thread_b",
          updatedAt: "2026-04-07T00:13:00.000Z",
          handoffIds: ["handoff_thread_b"]
        })
      ]
    },
    {
      agent: "alpha-agent",
      lastReadAt: "2026-04-07T00:10:00.000Z",
      readStateByThread: {
        thread_a: "2026-04-07T00:12:30.000Z"
      }
    }
  );

  assert.equal(snapshot.mailbox.unreadCount, 1);
  assert.equal(snapshot.threads[0].id, "thread_b");
  assert.equal(snapshot.threads[0].unread, true);
  assert.equal(snapshot.threads[1].id, "thread_a");
  assert.equal(snapshot.threads[1].unread, false);
  assert.equal(snapshot.handoffs.find((item) => item.threadId === "thread_a")?.unread, false);
  assert.equal(snapshot.handoffs.find((item) => item.threadId === "thread_b")?.unread, true);
});

test("buildConversationSnapshot filters delta items after cursor", () => {
  const snapshot = buildConversationSnapshot(
    makeHandoff({
      artifacts: [
        {
          type: "file",
          path: "./bridge/report.json",
          label: "report",
          createdAt: "2026-04-07T00:03:00.000Z"
        },
        {
          type: "file",
          path: "./bridge/final.json",
          label: "final",
          createdAt: "2026-04-07T00:12:00.000Z"
        }
      ],
      messages: [
        { author: "bridge-agent", body: "Please inspect this frame.", kind: "note", createdAt: "2026-04-07T00:01:00.000Z" },
        { author: "alpha-agent", body: "On it.", kind: "reply", createdAt: "2026-04-07T00:06:00.000Z" },
        { author: "alpha-agent", body: "Done.", kind: "reply", createdAt: "2026-04-07T00:11:00.000Z" }
      ],
      updatedAt: "2026-04-07T00:12:00.000Z"
    }),
    {
      after: "2026-04-07T00:06:30.000Z"
    }
  );

  assert.equal(snapshot.messages.length, 1);
  assert.equal(snapshot.messages[0].body, "Done.");
  assert.equal(snapshot.artifacts.length, 1);
  assert.equal(snapshot.artifacts[0].path, "./bridge/final.json");
  assert.equal(snapshot.delta.messageCount, 1);
  assert.equal(snapshot.delta.artifactCount, 1);
  assert.equal(snapshot.delta.hasChanges, true);
  assert.equal(snapshot.delta.nextAfter, "2026-04-07T00:12:00.000Z");
});

test("JsonHandoffStore updates updatedAt when appending messages", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-mailbox-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  const created = await store.create({
    channel: "devlog",
    targetAgent: "devlog-agent",
    sourceAgent: "bridge-agent",
    title: "Record the bridge change",
    payload: {
      type: "feature",
      title: "Record the bridge change",
      date: "07 April, 2026",
      summary: "Record the bridge change",
      details: ["Record the bridge change"],
      tags: ["xlink"]
    }
  });

  const before = created.updatedAt;
  const after = await store.appendMessage(created.id, {
    author: "devlog-agent",
    body: "Recorded.",
    kind: "reply"
  });

  assert.equal(after.updatedAt >= before, true);
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(parsed.handoffs[0].updatedAt >= before, true);

  await rm(dir, { recursive: true, force: true });
});

test("JsonHandoffStore tracks mailbox ack cursor", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-mailbox-ack-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  const initial = await store.getMailboxReadState("alpha-agent");
  assert.equal(initial.lastReadAt, null);

  const ack = await store.ackMailbox("alpha-agent", { cursor: "2026-04-07T00:10:00.000Z" });
  assert.equal(ack.lastReadAt, "2026-04-07T00:10:00.000Z");

  const persisted = await store.getMailboxReadState("alpha-agent");
  assert.equal(persisted.lastReadAt, "2026-04-07T00:10:00.000Z");

  const regressed = await store.ackMailbox("alpha-agent", { cursor: "2026-04-07T00:09:00.000Z" });
  assert.equal(regressed.lastReadAt, "2026-04-07T00:10:00.000Z");

  await rm(dir, { recursive: true, force: true });
});

test("JsonHandoffStore tracks per-thread mailbox ack without regressing global cursor", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-mailbox-thread-ack-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  await store.ackMailbox("alpha-agent", { cursor: "2026-04-07T00:10:00.000Z" });

  const threadAck = await store.ackMailbox("alpha-agent", {
    threadId: "thread_2026_04_07_001",
    cursor: "2026-04-07T00:12:00.000Z"
  });
  assert.equal(threadAck.threadId, "thread_2026_04_07_001");
  assert.equal(threadAck.lastReadAt, "2026-04-07T00:12:00.000Z");
  assert.equal(threadAck.globalLastReadAt, "2026-04-07T00:10:00.000Z");
  assert.equal(threadAck.threadLastReadAt, "2026-04-07T00:12:00.000Z");

  const persisted = await store.getMailboxReadState("alpha-agent", { threadId: "thread_2026_04_07_001" });
  assert.equal(persisted.lastReadAt, "2026-04-07T00:12:00.000Z");

  const regressed = await store.ackMailbox("alpha-agent", {
    threadId: "thread_2026_04_07_001",
    cursor: "2026-04-07T00:09:00.000Z"
  });
  assert.equal(regressed.lastReadAt, "2026-04-07T00:12:00.000Z");

  const globalPersisted = await store.getMailboxReadState("alpha-agent");
  assert.equal(globalPersisted.lastReadAt, "2026-04-07T00:10:00.000Z");

  await rm(dir, { recursive: true, force: true });
});

test("SqliteHandoffStore tracks per-thread mailbox ack without regressing global cursor", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-sqlite-mailbox-thread-ack-"));
  const filePath = path.join(dir, "handoffs.sqlite");
  const store = new SqliteHandoffStore(filePath);

  await store.initialize();
  await store.ackMailbox("alpha-agent", { cursor: "2026-04-07T00:10:00.000Z" });

  const threadAck = await store.ackMailbox("alpha-agent", {
    threadId: "thread_2026_04_07_001",
    cursor: "2026-04-07T00:12:00.000Z"
  });
  assert.equal(threadAck.threadId, "thread_2026_04_07_001");
  assert.equal(threadAck.lastReadAt, "2026-04-07T00:12:00.000Z");
  assert.equal(threadAck.globalLastReadAt, "2026-04-07T00:10:00.000Z");
  assert.equal(threadAck.threadLastReadAt, "2026-04-07T00:12:00.000Z");

  const persisted = await store.getMailboxReadState("alpha-agent", { threadId: "thread_2026_04_07_001" });
  assert.equal(persisted.lastReadAt, "2026-04-07T00:12:00.000Z");

  const regressed = await store.ackMailbox("alpha-agent", {
    threadId: "thread_2026_04_07_001",
    cursor: "2026-04-07T00:09:00.000Z"
  });
  assert.equal(regressed.lastReadAt, "2026-04-07T00:12:00.000Z");

  const globalPersisted = await store.getMailboxReadState("alpha-agent");
  assert.equal(globalPersisted.lastReadAt, "2026-04-07T00:10:00.000Z");

  await rm(dir, { recursive: true, force: true });
});
