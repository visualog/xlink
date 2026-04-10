import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandoffStore } from "./store.js";
import { JsonDevlogStore } from "./devlog-store.js";
import { JsonChannelProjectionStore } from "./channel-store.js";
import { createHandoffRoutes } from "./routes/handoffs.js";
import { getPathParts, json, notFound, withErrorHandling } from "./http.js";
import { buildDashboardSnapshot } from "./build-dashboard.js";
import { buildMailboxSnapshot } from "./mailbox.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_BACKEND = process.env.STORE_BACKEND ?? "sqlite";
const HANDOFF_DATA_PATH = process.env.HANDOFF_DATA_PATH
  ? path.resolve(process.env.HANDOFF_DATA_PATH)
  : path.resolve(__dirname, STORE_BACKEND === "sqlite" ? "../data/handoffs.sqlite" : "../data/handoffs.json");
const DEVLOG_DATA_PATH = process.env.DEVLOG_DATA_PATH
  ? path.resolve(process.env.DEVLOG_DATA_PATH)
  : path.resolve(__dirname, "../../xlog/data/devlogs.json");
const CHANNEL_DATA_DIR = process.env.CHANNEL_DATA_DIR
  ? path.resolve(process.env.CHANNEL_DATA_DIR)
  : path.resolve(__dirname, "../data/channels");
const DASHBOARD_DATA_PATH = process.env.DASHBOARD_DATA_PATH
  ? path.resolve(process.env.DASHBOARD_DATA_PATH)
  : path.resolve(__dirname, "../data/dashboard.json");

function buildProjectionStores() {
  const channels = ["bridge", "figma", "docs", "review"];
  const stores = new Map();

  for (const channel of channels) {
    stores.set(channel, new JsonChannelProjectionStore(path.resolve(CHANNEL_DATA_DIR, `${channel}.json`), channel));
  }

  return stores;
}

async function createServer() {
  const store = createHandoffStore({
    backend: STORE_BACKEND,
    filePath: HANDOFF_DATA_PATH
  });
  const devlogStore = new JsonDevlogStore(DEVLOG_DATA_PATH);
  const projectionStores = buildProjectionStores();
  await store.initialize();
  await devlogStore.initialize();
  for (const projectionStore of projectionStores.values()) {
    await projectionStore.initialize();
  }
  const handleHandoffRoute = createHandoffRoutes(store, { devlogStore, projectionStores });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const pathParts = getPathParts(url);

    return withErrorHandling(response, async () => {
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, {
          ok: true,
          service: "xlink",
          store: STORE_BACKEND,
          now: new Date().toISOString()
        });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return json(response, 200, {
          service: "xlink",
          endpoints: [
            "GET /health",
            "GET /dashboard",
            "POST /dashboard/rebuild",
            "GET /mailbox",
            "GET /handoffs",
            "GET /handoffs/:id",
            "GET /handoffs/:id/conversation",
            "GET /handoffs/:id/projection",
            "GET /handoffs/:id/devlog-card",
            "POST /handoffs/:id/devlog-ingest",
            "POST /handoffs/:id/devlog-sync",
            "POST /handoffs/:id/channel-ingest",
            "POST /handoffs/:id/channel-sync",
            "POST /handoffs/:id/xbridge-validate",
            "POST /handoffs",
            "POST /handoffs/:id/claim",
            "POST /handoffs/:id/block",
            "POST /handoffs/:id/reject",
            "POST /handoffs/:id/complete",
            "POST /handoffs/:id/reply",
            "POST /handoffs/:id/artifacts",
            "POST /handoffs/:id/messages"
          ]
        });
      }

      if (request.method === "GET" && url.pathname === "/dashboard") {
        return json(response, 200, {
          ok: true,
          dataPath: DASHBOARD_DATA_PATH,
          updatedAt: new Date().toISOString()
        });
      }

      if (request.method === "GET" && url.pathname === "/mailbox") {
        const statuses = url.searchParams.getAll("status");
        const status = statuses.length === 1 ? statuses[0] : undefined;
        const handoffs = await store.list({
          status,
          channel: url.searchParams.get("channel") ?? undefined,
          priority: url.searchParams.get("priority") ?? undefined,
          targetAgent: url.searchParams.get("targetAgent") ?? undefined,
          sourceAgent: url.searchParams.get("sourceAgent") ?? undefined,
          updatedSince: url.searchParams.get("after") ?? undefined
        });

        const result = buildMailboxSnapshot(handoffs, {
          agent: url.searchParams.get("agent") ?? undefined,
          channel: url.searchParams.get("channel") ?? undefined,
          status,
          statuses,
          after: url.searchParams.get("after") ?? undefined,
          includeClosed: url.searchParams.get("includeClosed") === "true"
        });

        return json(response, 200, { ok: true, ...result });
      }

      if (request.method === "POST" && url.pathname === "/dashboard/rebuild") {
        const result = await buildDashboardSnapshot({
          backend: STORE_BACKEND,
          handoffDataPath: HANDOFF_DATA_PATH,
          channelDataDir: CHANNEL_DATA_DIR,
          devlogDataPath: DEVLOG_DATA_PATH,
          outputPath: DASHBOARD_DATA_PATH
        });

        return json(response, 200, {
          ok: true,
          output: result.output,
          totalHandoffs: result.totalHandoffs,
          generatedAt: result.payload.generatedAt
        });
      }

      if (await handleHandoffRoute(request, response, url, pathParts)) {
        return;
      }

      return notFound(response);
    });
  });
}

const port = Number(process.env.PORT ?? "3850");
const server = await createServer();

server.listen(port, () => {
  console.log(`xlink coordinator listening on http://127.0.0.1:${port}`);
});
