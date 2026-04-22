import { json, readJsonBody } from "../http.js";
import { syncPendingDevlogHandoffs } from "../devlog-sync.js";

export function createAutomationRoutes(store, options = {}) {
  const devlogStore = options.devlogStore ?? null;
  const devlogRunner = options.devlogRunner ?? null;

  return async function handleAutomationRoute(request, response, url, pathParts) {
    if (pathParts[0] !== "automation") {
      return false;
    }

    if (request.method === "GET" && pathParts[1] === "devlog" && pathParts[2] === "status") {
      if (!devlogRunner) {
        json(response, 200, {
          enabled: false,
          active: false,
          agent: null,
          intervalMs: null,
          limit: null,
          lastStartedAt: null,
          lastFinishedAt: null,
          lastResult: null,
          lastError: null,
          pendingCount: null,
          pendingIds: []
        });
        return true;
      }

      const status = await devlogRunner.getStatus();
      json(response, 200, status);
      return true;
    }

    if (request.method === "POST" && pathParts[1] === "devlog" && pathParts[2] === "sync-pending") {
      if (!devlogStore) {
        json(response, 501, { error: "Devlog ingest store is not configured." });
        return true;
      }

      const body = await readJsonBody(request);
      const result = await syncPendingDevlogHandoffs(store, devlogStore, body);
      json(response, 200, result);
      return true;
    }

    return false;
  };
}
