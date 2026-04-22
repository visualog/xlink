import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { withErrorHandling } from "../src/http.js";
import { createDashboardRoutes } from "../src/routes/dashboard.js";

function makeResponseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writableEnded: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body += body;
      this.writableEnded = true;
    }
  };
}

test("GET /dashboard returns dashboard metadata", async () => {
  const route = createDashboardRoutes({
    dataPath: "/tmp/dashboard.json",
    rebuildDashboard: async () => ({ output: "", totalHandoffs: 0, payload: { generatedAt: "" } })
  });
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/dashboard");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.dataPath, "/tmp/dashboard.json");
  assert.equal(typeof payload.updatedAt, "string");
});

test("GET /dashboard/snapshot reads snapshot JSON content", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xlink-dashboard-route-"));
  const snapshotPath = path.join(tempDir, "dashboard.json");
  const expectedSnapshot = {
    generatedAt: "2026-04-22T00:00:00.000Z",
    summary: {
      totalHandoffs: 3
    }
  };

  await fs.writeFile(snapshotPath, `${JSON.stringify(expectedSnapshot, null, 2)}\n`, "utf8");

  const route = createDashboardRoutes({
    dataPath: snapshotPath,
    rebuildDashboard: async () => ({ output: "", totalHandoffs: 0, payload: { generatedAt: "" } })
  });
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/dashboard/snapshot");

  const handled = await route({ method: "GET" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.dataPath, snapshotPath);
  assert.deepEqual(payload.snapshot, expectedSnapshot);
});

test("GET /dashboard/snapshot returns 404 when snapshot file is missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xlink-dashboard-route-missing-"));
  const snapshotPath = path.join(tempDir, "missing-dashboard.json");
  const route = createDashboardRoutes({
    dataPath: snapshotPath,
    rebuildDashboard: async () => ({ output: "", totalHandoffs: 0, payload: { generatedAt: "" } })
  });
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/dashboard/snapshot");

  await withErrorHandling(response, () => route({ method: "GET" }, response, url));
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 404);
  assert.equal(payload.error, `Dashboard snapshot not found: ${snapshotPath}`);
});

test("POST /dashboard/rebuild forwards build result", async () => {
  const calls = [];
  const route = createDashboardRoutes({
    dataPath: "/tmp/dashboard.json",
    rebuildDashboard: async (options) => {
      calls.push(options);
      return {
        output: "/tmp/dashboard.json",
        totalHandoffs: 12,
        payload: {
          generatedAt: "2026-04-22T03:15:00.000Z"
        }
      };
    },
    rebuildOptions: {
      backend: "sqlite",
      outputPath: "/tmp/dashboard.json"
    }
  });
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/dashboard/rebuild");

  const handled = await route({ method: "POST" }, response, url);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.output, "/tmp/dashboard.json");
  assert.equal(payload.totalHandoffs, 12);
  assert.equal(payload.generatedAt, "2026-04-22T03:15:00.000Z");
  assert.deepEqual(calls, [{ backend: "sqlite", outputPath: "/tmp/dashboard.json" }]);
});
