import { promises as fs } from "node:fs";
import path from "node:path";
import { createHandoffStore } from "./store.js";

const STORE_BACKEND = process.env.STORE_BACKEND ?? "sqlite";
const HANDOFF_DATA_PATH = process.env.HANDOFF_DATA_PATH
  ? path.resolve(process.env.HANDOFF_DATA_PATH)
  : path.resolve(STORE_BACKEND === "sqlite" ? "data/handoffs.sqlite" : "data/handoffs.json");
const CHANNEL_DATA_DIR = process.env.CHANNEL_DATA_DIR
  ? path.resolve(process.env.CHANNEL_DATA_DIR)
  : path.resolve("data/channels");
const DEVLOG_DATA_PATH = process.env.DEVLOG_DATA_PATH
  ? path.resolve(process.env.DEVLOG_DATA_PATH)
  : path.resolve("../devlog/data/devlogs.json");
const OUTPUT_PATH = process.env.DASHBOARD_DATA_PATH
  ? path.resolve(process.env.DASHBOARD_DATA_PATH)
  : path.resolve("data/dashboard.json");

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizeByStatus(handoffs) {
  const counts = {
    pending: 0,
    claimed: 0,
    completed: 0,
    blocked: 0,
    rejected: 0
  };

  for (const handoff of handoffs) {
    counts[handoff.status] = (counts[handoff.status] ?? 0) + 1;
  }

  return counts;
}

function summarizeByChannel(handoffs) {
  const counts = {};

  for (const handoff of handoffs) {
    counts[handoff.channel] = (counts[handoff.channel] ?? 0) + 1;
  }

  return counts;
}

function parseValidationMessage(body) {
  if (typeof body !== "string" || !body.trim()) {
    return null;
  }

  const normalized = body.trim();
  const match = normalized.match(
    /xbridge compose validation (ready|blocked):\s*(\d+)\s*error\(s\),\s*(\d+)\s*warning\(s\)/i
  );
  if (!match) {
    return null;
  }

  const retryMatch = normalized.match(/retry\s+(\d+)회/i);
  return {
    readiness: String(match[1] || "").toLowerCase(),
    errorCount: Number(match[2] || 0),
    warningCount: Number(match[3] || 0),
    retryCount: retryMatch ? Number(retryMatch[1] || 0) : 0
  };
}

function summarizeValidation(handoffs) {
  const blockedHandoffIds = new Set();
  const summary = {
    events: 0,
    readyEvents: 0,
    blockedEvents: 0,
    errorTotal: 0,
    warningTotal: 0,
    retryEvents: 0,
    retryTotal: 0,
    blockedHandoffs: 0
  };

  for (const handoff of handoffs) {
    const messages = Array.isArray(handoff?.messages) ? handoff.messages : [];
    for (const message of messages) {
      const parsed = parseValidationMessage(message?.body);
      if (!parsed) {
        continue;
      }

      summary.events += 1;
      summary.errorTotal += parsed.errorCount;
      summary.warningTotal += parsed.warningCount;

      if (parsed.readiness === "blocked") {
        summary.blockedEvents += 1;
        if (handoff?.id) {
          blockedHandoffIds.add(handoff.id);
        }
      } else {
        summary.readyEvents += 1;
      }

      if (parsed.retryCount > 0) {
        summary.retryEvents += 1;
        summary.retryTotal += parsed.retryCount;
      }
    }
  }

  summary.blockedHandoffs = blockedHandoffIds.size;
  return summary;
}

async function loadChannelStores() {
  const result = [];

  try {
    const entries = await fs.readdir(CHANNEL_DATA_DIR);
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      const filePath = path.resolve(CHANNEL_DATA_DIR, entry);
      const data = await readJsonIfExists(filePath);
      if (!data) {
        continue;
      }

      result.push({
        channel: data.channel ?? entry.replace(/\.json$/, ""),
        updatedAt: data.updatedAt ?? null,
        entries: Array.isArray(data.entries) ? data.entries.length : 0,
        sampleKinds: Array.isArray(data.entries)
          ? Array.from(new Set(data.entries.slice(0, 5).map((item) => item.kind).filter(Boolean)))
          : [],
        filePath
      });
    }
  } catch {
    return [];
  }

  return result;
}

export async function buildDashboardSnapshot(options = {}) {
  const backend = options.backend ?? STORE_BACKEND;
  const handoffDataPath = options.handoffDataPath ?? HANDOFF_DATA_PATH;
  const channelDataDir = options.channelDataDir ?? CHANNEL_DATA_DIR;
  const devlogDataPath = options.devlogDataPath ?? DEVLOG_DATA_PATH;
  const outputPath = options.outputPath ?? OUTPUT_PATH;

  const store = createHandoffStore({
    backend,
    filePath: handoffDataPath
  });
  await store.initialize();

  const handoffs = await store.list();
  const previousChannelDir = CHANNEL_DATA_DIR;
  const previousDevlogPath = DEVLOG_DATA_PATH;
  void previousChannelDir;
  void previousDevlogPath;

  const channelEntries = [];

  try {
    const entries = await fs.readdir(channelDataDir);
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      const filePath = path.resolve(channelDataDir, entry);
      const data = await readJsonIfExists(filePath);
      if (!data) {
        continue;
      }

      channelEntries.push({
        channel: data.channel ?? entry.replace(/\.json$/, ""),
        updatedAt: data.updatedAt ?? null,
        entries: Array.isArray(data.entries) ? data.entries.length : 0,
        sampleKinds: Array.isArray(data.entries)
          ? Array.from(new Set(data.entries.slice(0, 5).map((item) => item.kind).filter(Boolean)))
          : [],
        previewEntries: Array.isArray(data.entries) ? data.entries.slice(0, 3) : [],
        filePath
      });
    }
  } catch {
    // Empty on purpose: dashboard should still build if projection stores are absent.
  }

  const devlogData = await readJsonIfExists(devlogDataPath);

  const payload = {
    generatedAt: new Date().toISOString(),
    backend,
    handoffDataPath,
    devlogDataPath,
    summary: {
      totalHandoffs: handoffs.length,
      byStatus: summarizeByStatus(handoffs),
      byChannel: summarizeByChannel(handoffs),
      validation: summarizeValidation(handoffs),
      channelStores: channelEntries.length,
      devlogEntries: Array.isArray(devlogData?.entries) ? devlogData.entries.length : 0
    },
    recentHandoffs: handoffs.slice(0, 12),
    channelStores: channelEntries,
    devlog: devlogData
      ? {
          updatedAt: devlogData.updatedAt ?? null,
          entries: Array.isArray(devlogData.entries) ? devlogData.entries.slice(0, 8) : []
        }
      : null
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    ok: true,
    output: outputPath,
    totalHandoffs: payload.summary.totalHandoffs,
    payload
  };
}

async function main() {
  const result = await buildDashboardSnapshot();
  console.log(JSON.stringify({
    ok: result.ok,
    output: result.output,
    totalHandoffs: result.totalHandoffs
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
