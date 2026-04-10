import test from "node:test";
import assert from "node:assert/strict";

import { callTool, listTools } from "../xlink-mcp/src/tools.js";

test("xlink-mcp tools list includes validate_xbridge_compose", () => {
  const tools = listTools();
  const validateTool = tools.find((tool) => tool.name === "validate_xbridge_compose");

  assert.ok(validateTool);
  assert.equal(validateTool.inputSchema.required.includes("id"), true);
});

test("validate_xbridge_compose posts to xbridge-validate endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url: String(url),
      options
    });
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          handoff: { id: "handoff_001" },
          validation: {
            validationReport: {
              status: "pass",
              canCompose: true
            }
          }
        })
    };
  };

  await callTool(
    "validate_xbridge_compose",
    {
      id: "handoff_001",
      payload: { parentId: "817:417", intentSections: [{ intent: "screen/topbar" }] },
      xbridgeBaseUrl: "http://127.0.0.1:3846",
      autoBlockOnFailure: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/handoffs/handoff_001/xbridge-validate");
  assert.equal(calls[0].options.method, "POST");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.baseUrl, "http://127.0.0.1:3846");
  assert.equal(body.autoBlockOnFailure, true);
  assert.equal(body.payload.parentId, "817:417");
});
