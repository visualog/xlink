import test from "node:test";
import assert from "node:assert/strict";

import {
  validateXbridgeComposePayload,
  validateXbridgeComposeWithRetry
} from "../src/xbridge-validator.js";

test("validateXbridgeComposePayload returns validation result and summary", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        canCompose: true,
        errors: [],
        warnings: [{ code: "missing_name" }],
        validationReport: {
          status: "warn",
          canCompose: true,
          errorCount: 0,
          warningCount: 1,
          resolvedSource: "sections",
          resolvedSectionCount: 1
        }
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
    assert.equal(result.validationReport.status, "warn");
    assert.equal(result.projection.warningCount, 1);
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

test("validateXbridgeComposeWithRetry injects default parent id and revalidates", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (_url, options) => {
    requestCount += 1;
    const payload = JSON.parse(options.body || "{}");

    if (requestCount === 1) {
      assert.equal(payload.parentId, undefined);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            canCompose: false,
            errors: [{ code: "missing_parent_id" }],
            warnings: [],
            validationReport: {
              status: "fail",
              canCompose: false,
              errorCount: 1,
              warningCount: 0,
              resolvedSource: "unknown",
              resolvedSectionCount: 0
            }
          }
        })
      };
    }

    assert.equal(payload.parentId, "817:417");
    return {
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          canCompose: true,
          errors: [],
          warnings: [],
          validationReport: {
            status: "pass",
            canCompose: true,
            errorCount: 0,
            warningCount: 0,
            resolvedSource: "sections",
            resolvedSectionCount: 1
          }
        }
      })
    };
  };

  try {
    const result = await validateXbridgeComposeWithRetry(
      {
        intentSections: [{ intent: "screen/topbar", title: "Overview" }]
      },
      {
        retryPolicy: {
          defaultParentId: "817:417",
          maxRetries: 1
        }
      }
    );

    assert.equal(result.validationReport.canCompose, true);
    assert.equal(result.retries, 1);
    assert.equal(result.appliedRules.includes("inject_default_parent_id"), true);
    assert.equal(result.attempts.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
