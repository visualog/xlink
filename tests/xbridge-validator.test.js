import test from "node:test";
import assert from "node:assert/strict";

import { validateXbridgeComposePayload } from "../src/xbridge-validator.js";

test("validateXbridgeComposePayload returns validation result and summary", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        canCompose: true,
        errors: [],
        warnings: [{ code: "missing_name" }]
      }
    })
  });

  try {
    const result = await validateXbridgeComposePayload({
      parentId: "817:417",
      intentSections: [{ intent: "screen/topbar", title: "Overview" }]
    });

    assert.equal(result.validation.canCompose, true);
    assert.equal(result.validation.warnings.length, 1);
    assert.match(result.summary, /ready: 0 error\(s\), 1 warning\(s\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validateXbridgeComposePayload throws when bridge returns an error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      ok: false,
      error: "missing parentId"
    })
  });

  try {
    await assert.rejects(
      () => validateXbridgeComposePayload({}),
      /missing parentId/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
