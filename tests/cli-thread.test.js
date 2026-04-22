import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JsonHandoffStore } from "../src/store.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function extractJsonObjects(text) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        objects.push(JSON.parse(text.slice(start, index + 1)));
        start = -1;
      }
    }
  }

  return objects;
}

async function setupCliFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-cli-thread-"));
  const handoffsPath = path.join(dir, "handoffs.json");
  const devlogPath = path.join(dir, "devlogs.json");
  const payloadPath = path.join(dir, "thread-handoff-payload.json");
  const store = new JsonHandoffStore(handoffsPath);

  await store.initialize();
  const thread = await store.createThread({
    id: "thread_2026_04_22_001",
    channel: "bridge",
    sourceAgent: "bridge-agent",
    targetAgent: "review-agent",
    title: "Review toolbar layout"
  });
  await store.appendThreadMessage(thread.id, {
    author: "bridge-agent",
    body: "Please review the toolbar spacing.",
    kind: "question"
  });
  await writeFile(
    payloadPath,
    JSON.stringify(
      {
        type: "feature",
        title: "Review toolbar layout",
        date: "22 April, 2026",
        details: ["Review toolbar layout"],
        tags: ["thread"]
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    dir,
    handoffsPath,
    devlogPath,
    payloadPath,
    store,
    threadId: thread.id
  };
}

function spawnCli(args, fixture) {
  return spawn(process.execPath, ["src/cli.js", ...args], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      STORE_BACKEND: "json",
      HANDOFF_DATA_PATH: fixture.handoffsPath,
      DEVLOG_DATA_PATH: fixture.devlogPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function runCli(args, fixture) {
  const child = spawnCli(args, fixture);
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const [code, signal] = await once(child, "exit");
  return {
    code,
    signal,
    stdout,
    stderr,
    objects: extractJsonObjects(stdout)
  };
}

test("list-threads prints thread collection", async () => {
  const fixture = await setupCliFixture();

  try {
    const result = await runCli(["list-threads", "--channel", "bridge"], fixture);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].threads.length, 1);
    assert.equal(result.objects[0].threads[0].id, fixture.threadId);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("list-threads can include thread summaries with read state", async () => {
  const fixture = await setupCliFixture();

  try {
    const thread = await fixture.store.getThreadById(fixture.threadId);
    const unreadCursor = new Date(Date.parse(thread.updatedAt) - 1000).toISOString();

    await fixture.store.ackMailbox("review-agent", {
      threadId: fixture.threadId,
      cursor: unreadCursor
    });

    const result = await runCli(["list-threads", "--agent", "review-agent", "--include-read-state"], fixture);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].threads.length, 1);
    assert.equal(result.objects[0].summaries.length, 1);
    assert.equal(result.objects[0].summaries[0].id, fixture.threadId);
    assert.equal(result.objects[0].summaries[0].unread, true);
    assert.equal(result.objects[0].summaries[0].lastReadAt, unreadCursor);
    assert.equal(result.objects[0].mailbox.agent, "review-agent");
    assert.equal(result.objects[0].mailbox.unreadCount, 1);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("get-thread prints a single thread", async () => {
  const fixture = await setupCliFixture();

  try {
    const result = await runCli(["get-thread", fixture.threadId], fixture);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].thread.id, fixture.threadId);
    assert.equal(result.objects[0].thread.title, "Review toolbar layout");
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("get-thread can include thread summary and read state", async () => {
  const fixture = await setupCliFixture();

  try {
    const thread = await fixture.store.getThreadById(fixture.threadId);
    const readCursor = new Date(Date.parse(thread.updatedAt) + 1000).toISOString();

    await fixture.store.ackMailbox("review-agent", {
      threadId: fixture.threadId,
      cursor: readCursor
    });

    const result = await runCli(
      ["get-thread", fixture.threadId, "--agent", "review-agent", "--include-read-state"],
      fixture
    );

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].thread.id, fixture.threadId);
    assert.equal(result.objects[0].summary.id, fixture.threadId);
    assert.equal(result.objects[0].summary.unread, false);
    assert.equal(result.objects[0].summary.lastReadAt, readCursor);
    assert.equal(result.objects[0].readState.agent, "review-agent");
    assert.equal(result.objects[0].readState.threadId, fixture.threadId);
    assert.equal(result.objects[0].readState.threadLastReadAt, readCursor);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("thread-messages prints thread messages", async () => {
  const fixture = await setupCliFixture();

  try {
    const result = await runCli(["thread-messages", fixture.threadId], fixture);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].thread.id, fixture.threadId);
    assert.equal(result.objects[0].messages.length, 1);
    assert.equal(result.objects[0].messages[0].body, "Please review the toolbar spacing.");
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("append-thread-message appends a new thread message", async () => {
  const fixture = await setupCliFixture();

  try {
    const result = await runCli(
      [
        "append-thread-message",
        fixture.threadId,
        "--author",
        "review-agent",
        "--body",
        "Spacing looks consistent now.",
        "--kind",
        "reply"
      ],
      fixture
    );
    const thread = await fixture.store.getThreadById(fixture.threadId);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].thread.messages.length, 2);
    assert.equal(thread.messages.length, 2);
    assert.equal(thread.messages[1].author, "review-agent");
    assert.equal(thread.messages[1].kind, "reply");
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("create-thread-handoff creates a handoff linked to the thread", async () => {
  const fixture = await setupCliFixture();

  try {
    const result = await runCli(
      ["create-thread-handoff", fixture.threadId, "--input", fixture.payloadPath, "--priority", "high"],
      fixture
    );
    const thread = await fixture.store.getThreadById(fixture.threadId);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].thread.id, fixture.threadId);
    assert.equal(result.objects[0].handoff.threadId, fixture.threadId);
    assert.equal(result.objects[0].handoff.priority, "high");
    assert.equal(thread.handoffIds.includes(result.objects[0].handoff.id), true);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("record-devlog does not complete handoff when devlog ingest fails", async () => {
  const fixture = await setupCliFixture();
  const failingDevlogPath = path.join(fixture.dir, "devlog-dir");

  try {
    await writeFile(
      path.join(fixture.dir, "devlog-payload.json"),
      JSON.stringify(
        {
          type: "feature",
          title: "Toolbar filter 작업 devlog 등록",
          date: "22 April, 2026",
          details: ["Toolbar filter 작업 devlog 등록"],
          tags: ["devlog"]
        },
        null,
        2
      ),
      "utf8"
    );
    await mkdir(failingDevlogPath);

    const child = spawn(process.execPath, ["src/cli.js", "record-devlog", "--input", path.join(fixture.dir, "devlog-payload.json")], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        STORE_BACKEND: "json",
        HANDOFF_DATA_PATH: fixture.handoffsPath,
        DEVLOG_DATA_PATH: failingDevlogPath
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const [code] = await once(child, "exit");

    assert.notEqual(code, 0);
    assert.equal(stderr.length > 0, true);

    const handoffs = await fixture.store.list({ channel: "devlog" });
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].status, "claimed");
    assert.equal(handoffs[0].completedAt, null);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});
