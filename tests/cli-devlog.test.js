import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
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

async function setupDevlogFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xlink-cli-devlog-"));
  const handoffsPath = path.join(dir, "handoffs.json");
  const devlogPath = path.join(dir, "devlogs.json");
  const store = new JsonHandoffStore(handoffsPath);

  await store.initialize();
  await store.create({
    channel: "devlog",
    targetAgent: "devlog-agent",
    sourceAgent: "bridge-agent",
    title: "첫 번째 devlog",
    payload: {
      type: "feature",
      title: "첫 번째 devlog",
      date: "22 April, 2026",
      details: ["첫 번째 devlog"],
      tags: ["devlog"]
    }
  });
  await store.create({
    channel: "devlog",
    targetAgent: "devlog-agent",
    sourceAgent: "bridge-agent",
    title: "두 번째 devlog",
    payload: {
      type: "feature",
      title: "두 번째 devlog",
      date: "22 April, 2026",
      details: ["두 번째 devlog"],
      tags: ["devlog"]
    }
  });

  return { dir, handoffsPath, devlogPath, store };
}

async function runCli(args, fixture) {
  const child = spawn(process.execPath, ["src/cli.js", ...args], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      STORE_BACKEND: "json",
      HANDOFF_DATA_PATH: fixture.handoffsPath,
      DEVLOG_DATA_PATH: fixture.devlogPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const [code] = await once(child, "exit");
  return {
    code,
    stdout,
    stderr,
    objects: extractJsonObjects(stdout)
  };
}

test("sync-pending-devlogs bulk-syncs pending devlog handoffs", async () => {
  const fixture = await setupDevlogFixture();

  try {
    const result = await runCli(["sync-pending-devlogs", "--agent", "devlog-agent", "--limit", "1"], fixture);

    assert.equal(result.code, 0);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].syncedCount, 1);
    assert.equal(result.objects[0].remainingPending, 1);

    const handoffs = await fixture.store.list({ channel: "devlog" });
    assert.equal(handoffs.filter((handoff) => handoff.status === "completed").length, 1);
    assert.equal(handoffs.filter((handoff) => handoff.status === "pending").length, 1);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});
