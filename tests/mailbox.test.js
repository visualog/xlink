import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildConversationSnapshot, buildMailboxSnapshot, summarizeConversation } from "../src/mailbox.js";
import { JsonHandoffStore } from "../src/store.js";

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
    [
      makeHandoff(),
      makeHandoff({
        id: "handoff_2026_04_07_002",
        targetAgent: "beta-agent",
        claimedBy: "beta-agent",
        updatedAt: "2026-04-07T00:20:00.000Z"
      }),
      makeHandoff({
        id: "handoff_2026_04_07_003",
        status: "completed",
        updatedAt: "2026-04-06T23:59:00.000Z"
      })
    ],
    {
      agent: "alpha-agent",
      after: "2026-04-07T00:02:00.000Z"
    }
  );

  assert.equal(snapshot.mailbox.total, 1);
  assert.equal(snapshot.handoffs[0].id, "handoff_2026_04_07_001");
  assert.equal(snapshot.mailbox.nextAfter, "2026-04-07T00:10:00.000Z");
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
