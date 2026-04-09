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
