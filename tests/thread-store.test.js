import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonHandoffStore } from "../src/store.js";

function makePayload(title = "Thread task") {
  return {
    type: "feature",
    title,
    date: "22 April, 2026",
    details: [title],
    tags: ["thread"]
  };
}

test("JsonHandoffStore creates standalone threads and appends thread messages", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-thread-store-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  const thread = await store.createThread({
    channel: "bridge",
    sourceAgent: "bridge-agent",
    targetAgent: "review-agent",
    title: "Review current frame"
  });

  const updated = await store.appendThreadMessage(thread.id, {
    author: "bridge-agent",
    body: "Can you review the spacing?",
    kind: "question"
  });

  assert.equal(updated.messages.length, 1);
  assert.equal(updated.messages[0].body, "Can you review the spacing?");

  await rm(dir, { recursive: true, force: true });
});

test("JsonHandoffStore auto-creates a thread when handoff is created", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-thread-auto-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  const handoff = await store.create({
    channel: "bridge",
    sourceAgent: "bridge-agent",
    targetAgent: "review-agent",
    title: "Inspect the updated frame",
    payload: makePayload("Inspect the updated frame")
  });

  assert.ok(handoff.threadId);

  const thread = await store.getThreadById(handoff.threadId);
  assert.equal(thread.title, "Inspect the updated frame");
  assert.deepEqual(thread.handoffIds, [handoff.id]);

  await rm(dir, { recursive: true, force: true });
});

test("JsonHandoffStore creates linked handoff from an existing thread", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-thread-handoff-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  const thread = await store.createThread({
    channel: "docs",
    sourceAgent: "bridge-agent",
    targetAgent: "docs-agent",
    title: "Document handoff notes"
  });

  const result = await store.createThreadHandoff(thread.id, {
    payload: makePayload("Document handoff notes")
  });

  assert.equal(result.handoff.threadId, thread.id);
  assert.equal(result.handoff.channel, "docs");
  assert.equal(result.handoff.targetAgent, "docs-agent");
  assert.equal(result.thread.handoffIds.includes(result.handoff.id), true);

  await rm(dir, { recursive: true, force: true });
});

test("JsonHandoffStore mirrors handoff replies into linked thread messages", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-thread-mirror-"));
  const filePath = path.join(dir, "handoffs.json");
  const store = new JsonHandoffStore(filePath);

  await store.initialize();
  const handoff = await store.create({
    channel: "bridge",
    sourceAgent: "bridge-agent",
    targetAgent: "review-agent",
    title: "Mirror reply into thread",
    payload: makePayload("Mirror reply into thread")
  });

  await store.appendMessage(handoff.id, {
    author: "review-agent",
    body: "Checked and approved.",
    kind: "reply"
  });

  const thread = await store.getThreadById(handoff.threadId);
  assert.equal(thread.messages.some((message) => message.body === "Checked and approved."), true);

  await rm(dir, { recursive: true, force: true });
});
