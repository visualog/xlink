import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { JsonChannelProjectionStore } from "../src/channel-store.js";

test("JsonChannelProjectionStore lists entries and finds entry by id", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xlink-channel-store-"));
  const filePath = path.join(tempDir, "docs.json");
  const store = new JsonChannelProjectionStore(filePath, "docs");
  const entry = {
    id: "handoff_001",
    kind: "docs_brief",
    summary: "Summarize handoff"
  };

  await store.initialize();
  await store.ingest(entry);

  const snapshot = await store.listEntries();
  const selected = await store.getEntryById("handoff_001");

  assert.equal(snapshot.channel, "docs");
  assert.equal(snapshot.entries.length, 1);
  assert.deepEqual(snapshot.entries[0], entry);
  assert.equal(selected.channel, "docs");
  assert.deepEqual(selected.entry, entry);
});

test("JsonChannelProjectionStore can resolve entry ids from data.id fallback", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xlink-channel-store-"));
  const filePath = path.join(tempDir, "bridge.json");
  const store = new JsonChannelProjectionStore(filePath, "bridge");
  const entry = {
    kind: "bridge_projection",
    data: {
      id: "handoff_002"
    }
  };

  await store.initialize();
  await store.ingest(entry);

  const selected = await store.getEntryById("handoff_002");

  assert.equal(selected.channel, "bridge");
  assert.deepEqual(selected.entry, entry);
});

test("JsonChannelProjectionStore can filter entries by ids and threadId", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xlink-channel-store-"));
  const filePath = path.join(tempDir, "figma.json");
  const store = new JsonChannelProjectionStore(filePath, "figma");

  await store.initialize();
  await store.ingest({
    id: "handoff_001",
    kind: "figma-brief",
    data: {
      id: "handoff_001",
      threadId: "thread_001"
    }
  });
  await store.ingest({
    id: "handoff_002",
    kind: "figma-brief",
    data: {
      id: "handoff_002",
      threadId: "thread_002"
    }
  });

  const snapshot = await store.listEntries({ ids: ["thread_001"] });

  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].id, "handoff_001");
});
