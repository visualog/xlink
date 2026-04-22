import test from "node:test";
import assert from "node:assert/strict";

import { createChannelRoutes } from "../src/routes/channels.js";

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
      if (body) {
        this.body += body;
      }
      this.writableEnded = true;
    }
  };
}

test("GET /channels/:channel/entries returns channel projection snapshot", async () => {
  const route = createChannelRoutes(new Map([
    ["docs", {
      async listEntries() {
        return {
          channel: "docs",
          updatedAt: "2026-04-22",
          entries: [
            { id: "handoff_001", kind: "docs_brief", summary: "Summarize handoff" }
          ]
        };
      }
    }]
  ]));
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/channels/docs/entries");

  const handled = await route({ method: "GET" }, response, url, ["channels", "docs", "entries"]);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.channel, "docs");
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.entries[0].id, "handoff_001");
});

test("GET /channels/:channel/entries/:id returns a single projection entry", async () => {
  const route = createChannelRoutes(new Map([
    ["review", {
      async getEntryById(id) {
        return {
          channel: "review",
          updatedAt: "2026-04-22",
          entry: { id, kind: "review_packet", summary: "Review this change" }
        };
      }
    }]
  ]));
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/channels/review/entries/handoff_002");

  const handled = await route({ method: "GET" }, response, url, ["channels", "review", "entries", "handoff_002"]);
  const payload = JSON.parse(response.body);

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.channel, "review");
  assert.equal(payload.entry.id, "handoff_002");
});

test("GET /channels/:channel/entries returns 404 for unknown channel", async () => {
  const route = createChannelRoutes(new Map());
  const response = makeResponseCapture();
  const url = new URL("http://127.0.0.1:3850/channels/unknown/entries");

  await assert.rejects(
    () => route({ method: "GET" }, response, url, ["channels", "unknown", "entries"]),
    { name: "StoreError", statusCode: 404 }
  );
});
