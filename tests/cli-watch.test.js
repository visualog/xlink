import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonHandoffStore } from "../src/store.js";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-cli-watch-"));
  const handoffsPath = path.join(dir, "handoffs.json");
  const devlogPath = path.join(dir, "devlogs.json");
  const store = new JsonHandoffStore(handoffsPath);
  await store.initialize();

  const handoff = await store.create({
    id: "handoff_2026_04_07_101",
    channel: "bridge",
    targetAgent: "alpha-agent",
    sourceAgent: "bridge-agent",
    title: "Watch CLI handshake",
    payload: {
      type: "feature",
      title: "Watch CLI handshake",
      date: "07 April, 2026",
      details: ["Exercise watch CLI behavior"],
      tags: ["watch"]
    }
  });

  return { dir, handoffsPath, devlogPath, store, handoff };
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

async function waitForExit(child, timeoutMs = 2000) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const exited = once(child, "exit").then(([code, signal]) => ({
    code,
    signal
  }));
  const timeout = delay(timeoutMs).then(() => {
    throw new Error(`CLI did not exit within ${timeoutMs}ms`);
  });

  const result = await Promise.race([exited, timeout]);
  return {
    ...result,
    stdout,
    stderr
  };
}

async function waitForFirstJson(child, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const onData = (chunk) => {
      buffer += String(chunk);
      const objects = extractJsonObjects(buffer);
      if (objects.length > 0) {
        cleanup();
        resolve(objects[0]);
      }
    };

    const onExit = () => {
      cleanup();
      reject(new Error("CLI exited before emitting JSON output"));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for JSON output (${timeoutMs}ms)`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.on("exit", onExit);
  });
}

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await once(child, "exit");
}

test("watch-mailbox --once prints snapshot and exits", async () => {
  const fixture = await setupCliFixture();
  try {
    const child = spawnCli(["watch-mailbox", "--agent", "alpha-agent", "--once"], fixture);
    const result = await waitForExit(child, 2000);
    const objects = extractJsonObjects(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(objects.length, 1);
    assert.equal(objects[0].mailbox.agent, "alpha-agent");
    assert.equal(objects[0].handoffs[0].id, fixture.handoff.id);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("mailbox-unread prints unread summary", async () => {
  const fixture = await setupCliFixture();
  try {
    const child = spawnCli(["mailbox-unread", "--agent", "alpha-agent"], fixture);
    const result = await waitForExit(child, 2000);
    const objects = extractJsonObjects(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(objects.length, 1);
    assert.equal(objects[0].agent, "alpha-agent");
    assert.equal(objects[0].unreadCount, 1);
    assert.deepEqual(objects[0].handoffIds, [fixture.handoff.id]);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("mailbox-unread --thread scopes unread summary to one thread", async () => {
  const fixture = await setupCliFixture();
  try {
    const secondHandoff = await fixture.store.create({
      id: "handoff_2026_04_07_102",
      channel: "bridge",
      targetAgent: "alpha-agent",
      sourceAgent: "bridge-agent",
      title: "Second thread for unread filtering",
      payload: {
        type: "feature",
        title: "Second thread for unread filtering",
        date: "07 April, 2026",
        details: ["Ensure CLI thread filtering works"],
        tags: ["watch"]
      }
    });
    const child = spawnCli(
      ["mailbox-unread", "--agent", "alpha-agent", "--thread", fixture.handoff.threadId],
      fixture
    );
    const result = await waitForExit(child, 2000);
    const objects = extractJsonObjects(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(objects.length, 1);
    assert.equal(objects[0].unreadCount, 1);
    assert.deepEqual(objects[0].threadIds, [fixture.handoff.threadId]);
    assert.deepEqual(objects[0].handoffIds, [fixture.handoff.id]);
    assert.notEqual(secondHandoff.threadId, fixture.handoff.threadId);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("ack-mailbox advances mailbox cursor", async () => {
  const fixture = await setupCliFixture();
  try {
    const child = spawnCli(["ack-mailbox", "--agent", "alpha-agent", "--cursor", fixture.handoff.updatedAt], fixture);
    const result = await waitForExit(child, 2000);
    const objects = extractJsonObjects(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(objects.length, 1);
    assert.equal(objects[0].ack.agent, "alpha-agent");
    assert.equal(objects[0].ack.lastReadAt, fixture.handoff.updatedAt);
    assert.equal(objects[0].unreadCount, 0);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("ack-mailbox --thread scopes unread count to the acknowledged thread", async () => {
  const fixture = await setupCliFixture();
  try {
    await delay(5);
    await fixture.store.create({
      id: "handoff_2026_04_07_102",
      channel: "bridge",
      targetAgent: "alpha-agent",
      sourceAgent: "bridge-agent",
      title: "Second thread for ack filtering",
      payload: {
        type: "feature",
        title: "Second thread for ack filtering",
        date: "07 April, 2026",
        details: ["Keep another thread unread after thread ack"],
        tags: ["watch"]
      }
    });

    const child = spawnCli(
      [
        "ack-mailbox",
        "--agent",
        "alpha-agent",
        "--thread",
        fixture.handoff.threadId,
        "--cursor",
        fixture.handoff.updatedAt
      ],
      fixture
    );
    const result = await waitForExit(child, 2000);
    const objects = extractJsonObjects(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(objects.length, 1);
    assert.equal(objects[0].ack.agent, "alpha-agent");
    assert.equal(objects[0].ack.lastReadAt, fixture.handoff.updatedAt);
    assert.equal(objects[0].unreadCount, 0);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("watch-conversation --once exits without output when there are no changes", async () => {
  const fixture = await setupCliFixture();
  try {
    const child = spawnCli(
      ["watch-conversation", fixture.handoff.id, "--after", fixture.handoff.updatedAt, "--once"],
      fixture
    );
    const result = await waitForExit(child, 2000);

    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), "");
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("watch-conversation interval values under 250ms are clamped for polling", async () => {
  const fixture = await setupCliFixture();
  const child = spawnCli(
    ["watch-conversation", fixture.handoff.id, "--after", fixture.handoff.updatedAt, "--interval", "1"],
    fixture
  );

  try {
    const startedAt = Date.now();
    setTimeout(() => {
      fixture.store.appendMessage(fixture.handoff.id, {
        author: "bridge-agent",
        body: "interval clamp check",
        kind: "note"
      });
    }, 120);

    const snapshot = await waitForFirstJson(child, 1500);
    const elapsed = Date.now() - startedAt;

    assert.equal(snapshot.delta.hasChanges, true);
    assert.equal(snapshot.messages.some((message) => message.body === "interval clamp check"), true);
    assert.equal(elapsed >= 200, true);
    assert.equal(elapsed < 1200, true);
  } finally {
    await terminate(child);
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("watch-conversation invalid interval falls back to default slow polling", async () => {
  const fixture = await setupCliFixture();
  const child = spawnCli(
    ["watch-conversation", fixture.handoff.id, "--after", fixture.handoff.updatedAt, "--interval", "0"],
    fixture
  );

  try {
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    setTimeout(() => {
      fixture.store.appendMessage(fixture.handoff.id, {
        author: "bridge-agent",
        body: "default interval check",
        kind: "note"
      });
    }, 120);

    await delay(700);
    assert.equal(extractJsonObjects(stdout).length, 0);
  } finally {
    await terminate(child);
    await rm(fixture.dir, { recursive: true, force: true });
  }
});
