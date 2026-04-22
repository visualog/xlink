import { promises as fs } from "node:fs";
import { json } from "../http.js";
import { StoreError } from "../store.js";

async function readDashboardSnapshot(dataPath) {
  let raw;

  try {
    raw = await fs.readFile(dataPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new StoreError(404, `Dashboard snapshot not found: ${dataPath}`);
    }

    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new StoreError(500, `Dashboard snapshot is not valid JSON: ${dataPath}`);
  }
}

export function createDashboardRoutes(options = {}) {
  const dataPath = options.dataPath;
  const rebuildDashboard = options.rebuildDashboard;
  const rebuildOptions = options.rebuildOptions ?? {};

  return async function handleDashboardRoute(request, response, url) {
    if (request.method === "GET" && url.pathname === "/dashboard") {
      json(response, 200, {
        ok: true,
        dataPath,
        updatedAt: new Date().toISOString()
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/dashboard/snapshot") {
      const snapshot = await readDashboardSnapshot(dataPath);
      json(response, 200, {
        ok: true,
        dataPath,
        snapshot
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/dashboard/rebuild") {
      const result = await rebuildDashboard(rebuildOptions);

      json(response, 200, {
        ok: true,
        output: result.output,
        totalHandoffs: result.totalHandoffs,
        generatedAt: result.payload.generatedAt
      });
      return true;
    }

    return false;
  };
}
