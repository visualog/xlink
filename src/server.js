import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandoffStore } from "./store.js";
import { JsonDevlogStore } from "./devlog-store.js";
import { JsonChannelProjectionStore } from "./channel-store.js";
import { createHandoffRoutes } from "./routes/handoffs.js";
import { createMailboxRoutes } from "./routes/mailbox.js";
import { createChannelRoutes } from "./routes/channels.js";
import { createDashboardRoutes } from "./routes/dashboard.js";
import { createDesignerRoutes } from "./routes/designer.js";
import { createReviewRoutes } from "./routes/review.js";
import { createThreadRoutes } from "./routes/threads.js";
import { createAutomationRoutes } from "./routes/automation.js";
import { getPathParts, json, notFound, withErrorHandling } from "./http.js";
import { buildDashboardSnapshot } from "./build-dashboard.js";
import { createDevlogAutomationRunner } from "./automation-runner.js";

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
const AUTO_SYNC_PENDING_DEVLOGS = process.env.AUTO_SYNC_PENDING_DEVLOGS === "true";
const AUTO_SYNC_PENDING_DEVLOGS_INTERVAL_MS = Number(process.env.AUTO_SYNC_PENDING_DEVLOGS_INTERVAL_MS ?? "60000");
const AUTO_SYNC_PENDING_DEVLOGS_LIMIT = Number(process.env.AUTO_SYNC_PENDING_DEVLOGS_LIMIT ?? "20");
const AUTO_SYNC_PENDING_DEVLOGS_AGENT = process.env.AUTO_SYNC_PENDING_DEVLOGS_AGENT ?? "devlog-agent";

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
  const devlogRunner = createDevlogAutomationRunner(store, devlogStore, {
    enabled: AUTO_SYNC_PENDING_DEVLOGS,
    agent: AUTO_SYNC_PENDING_DEVLOGS_AGENT,
    intervalMs: AUTO_SYNC_PENDING_DEVLOGS_INTERVAL_MS,
    limit: AUTO_SYNC_PENDING_DEVLOGS_LIMIT
  });
  devlogRunner.start();
  const handleHandoffRoute = createHandoffRoutes(store, { devlogStore, projectionStores });
  const handleMailboxRoute = createMailboxRoutes(store);
  const handleChannelRoute = createChannelRoutes(projectionStores);
  const handleDesignerRoute = createDesignerRoutes(store, projectionStores);
  const handleReviewRoute = createReviewRoutes(store, projectionStores);
  const handleThreadRoute = createThreadRoutes(store, projectionStores);
  const handleAutomationRoute = createAutomationRoutes(store, { devlogStore, devlogRunner });
  const handleDashboardRoute = createDashboardRoutes({
    dataPath: DASHBOARD_DATA_PATH,
    rebuildDashboard: buildDashboardSnapshot,
    rebuildOptions: {
      backend: STORE_BACKEND,
      handoffDataPath: HANDOFF_DATA_PATH,
      channelDataDir: CHANNEL_DATA_DIR,
      devlogDataPath: DEVLOG_DATA_PATH,
      outputPath: DASHBOARD_DATA_PATH
    }
  });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const pathParts = getPathParts(url);

    return withErrorHandling(response, async () => {
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, {
          ok: true,
          service: "xlink",
          store: STORE_BACKEND,
          automation: {
            autoSyncPendingDevlogs: AUTO_SYNC_PENDING_DEVLOGS
          },
          now: new Date().toISOString()
        });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return json(response, 200, {
          service: "xlink",
          endpoints: [
            "GET /health",
            "GET /dashboard",
            "GET /dashboard/snapshot",
            "POST /dashboard/rebuild",
            "GET /designer/context",
            "GET /review/context",
            "POST /review/threads/:id/decision",
            "GET /mailbox",
            "GET /mailbox/stream",
            "GET /mailbox/:agent/unread-count",
            "POST /mailbox/:agent/ack",
            "GET /threads",
            "POST /threads",
            "GET /threads/:id",
            "GET /threads/:id/context",
            "GET /threads/:id/messages",
            "POST /threads/:id/messages",
            "POST /threads/:id/handoffs",
            "POST /threads/:id/deliverables",
            "POST /threads/:id/verification",
            "GET /automation/devlog/status",
            "POST /automation/devlog/sync-pending",
            "GET /channels/:channel/entries",
            "GET /channels/:channel/entries/:id",
            "GET /handoffs",
            "GET /handoffs/:id",
            "GET /handoffs/:id/conversation",
            "GET /handoffs/:id/conversation/stream",
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

      if (await handleDashboardRoute(request, response, url)) {
        return;
      }

      if (await handleMailboxRoute(request, response, url)) {
        return;
      }

      if (await handleChannelRoute(request, response, url, pathParts)) {
        return;
      }

      if (await handleDesignerRoute(request, response, url)) {
        return;
      }

      if (await handleReviewRoute(request, response, url)) {
        return;
      }

      if (await handleThreadRoute(request, response, url, pathParts)) {
        return;
      }

      if (await handleAutomationRoute(request, response, url, pathParts)) {
        return;
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
