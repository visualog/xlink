import test from "node:test";
import assert from "node:assert/strict";

import { callTool, listTools } from "../xlink-mcp/src/tools.js";

test("xlink-mcp tools list includes validate_xbridge_compose", () => {
  const tools = listTools();
  const validateTool = tools.find((tool) => tool.name === "validate_xbridge_compose");

  assert.ok(validateTool);
  assert.equal(validateTool.inputSchema.required.includes("id"), true);
});

test("xlink-mcp tools list includes sync_pending_devlogs", () => {
  const tools = listTools();
  const syncTool = tools.find((tool) => tool.name === "sync_pending_devlogs");

  assert.ok(syncTool);
  assert.deepEqual(syncTool.inputSchema.required, ["agent"]);
  assert.equal(typeof syncTool.inputSchema.properties.limit, "object");
  assert.equal(typeof syncTool.inputSchema.properties.note, "object");
  assert.equal(typeof syncTool.inputSchema.properties.result, "object");
});

test("xlink-mcp tools list includes mailbox unread tools", () => {
  const tools = listTools();
  const unreadTool = tools.find((tool) => tool.name === "get_mailbox_unread_count");
  const ackTool = tools.find((tool) => tool.name === "ack_mailbox");

  assert.ok(unreadTool);
  assert.ok(ackTool);
  assert.equal(typeof unreadTool.inputSchema.properties.threadId, "object");
  assert.equal(typeof ackTool.inputSchema.properties.threadId, "object");
});

test("xlink-mcp tools list includes thread and observability tools", () => {
  const tools = listTools();
  const listThreadsTool = tools.find((tool) => tool.name === "list_threads");
  const getThreadTool = tools.find((tool) => tool.name === "get_thread");
  const getThreadContextTool = tools.find((tool) => tool.name === "get_thread_context");
  const designerContextTool = tools.find((tool) => tool.name === "get_designer_context");
  const reviewContextTool = tools.find((tool) => tool.name === "get_review_context");
  const decideReviewThreadTool = tools.find((tool) => tool.name === "decide_review_thread");
  const addThreadDeliverablesTool = tools.find((tool) => tool.name === "add_thread_deliverables");
  const recordThreadVerificationTool = tools.find((tool) => tool.name === "record_thread_verification");
  const handoffThreadForReviewTool = tools.find((tool) => tool.name === "handoff_thread_for_review");

  assert.ok(listThreadsTool);
  assert.ok(tools.find((tool) => tool.name === "create_thread"));
  assert.ok(getThreadTool);
  assert.ok(getThreadContextTool);
  assert.ok(designerContextTool);
  assert.ok(reviewContextTool);
  assert.ok(decideReviewThreadTool);
  assert.ok(addThreadDeliverablesTool);
  assert.ok(recordThreadVerificationTool);
  assert.ok(handoffThreadForReviewTool);
  assert.ok(tools.find((tool) => tool.name === "get_thread_messages"));
  assert.ok(tools.find((tool) => tool.name === "create_thread_handoff"));
  assert.ok(tools.find((tool) => tool.name === "get_dashboard_snapshot"));
  assert.ok(tools.find((tool) => tool.name === "list_channel_entries"));
  assert.ok(tools.find((tool) => tool.name === "get_channel_entry"));
  assert.equal(typeof listThreadsTool.inputSchema.properties.agent, "object");
  assert.equal(typeof listThreadsTool.inputSchema.properties.includeReadState, "object");
  assert.equal(typeof getThreadTool.inputSchema.properties.agent, "object");
  assert.equal(typeof getThreadTool.inputSchema.properties.includeReadState, "object");
  assert.equal(typeof getThreadContextTool.inputSchema.properties.agent, "object");
  assert.equal(typeof getThreadContextTool.inputSchema.properties.messageLimit, "object");
  assert.equal(typeof getThreadContextTool.inputSchema.properties.handoffLimit, "object");
  assert.equal(typeof getThreadContextTool.inputSchema.properties.includeClosed, "object");
  assert.equal(typeof designerContextTool.inputSchema.properties.agent, "object");
  assert.equal(typeof designerContextTool.inputSchema.properties.handoffLimit, "object");
  assert.equal(typeof designerContextTool.inputSchema.properties.briefLimit, "object");
  assert.equal(typeof reviewContextTool.inputSchema.properties.agent, "object");
  assert.equal(typeof reviewContextTool.inputSchema.properties.handoffLimit, "object");
  assert.equal(typeof reviewContextTool.inputSchema.properties.briefLimit, "object");
  assert.equal(decideReviewThreadTool.inputSchema.required.includes("id"), true);
  assert.equal(decideReviewThreadTool.inputSchema.required.includes("decision"), true);
  assert.equal(addThreadDeliverablesTool.inputSchema.required.includes("id"), true);
  assert.equal(addThreadDeliverablesTool.inputSchema.required.includes("artifacts"), true);
  assert.equal(recordThreadVerificationTool.inputSchema.required.includes("id"), true);
  assert.equal(recordThreadVerificationTool.inputSchema.required.includes("status"), true);
  assert.equal(handoffThreadForReviewTool.inputSchema.required.includes("id"), true);
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
      autoRetryOnFailure: true,
      defaultParentId: "817:417",
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
  assert.equal(body.autoRetryOnFailure, true);
  assert.equal(body.defaultParentId, "817:417");
  assert.equal(body.autoBlockOnFailure, true);
  assert.equal(body.payload.parentId, "817:417");
});

test("get_conversation forwards after query parameter", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url: String(url),
      options
    });
    return {
      ok: true,
      text: async () => JSON.stringify({ handoff: { id: "handoff_001" }, messages: [] })
    };
  };

  await callTool(
    "get_conversation",
    {
      id: "handoff_001",
      after: "cursor_123"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/handoffs/handoff_001/conversation?after=cursor_123");
  assert.equal(calls[0].options.method, "GET");
});

test("get_conversation omits after query parameter when not provided", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url: String(url),
      options
    });
    return {
      ok: true,
      text: async () => JSON.stringify({ handoff: { id: "handoff_001" }, messages: [] })
    };
  };

  await callTool(
    "get_conversation",
    {
      id: "handoff_001"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/handoffs/handoff_001/conversation");
  assert.equal(calls[0].options.method, "GET");
});

test("get_designer_context forwards filters and defaults channel to figma", async () => {
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
          context: {
            channel: "figma",
            agent: "designer-agent",
            handoffs: [],
            briefs: []
          }
        })
    };
  };

  const result = await callTool(
    "get_designer_context",
    {
      agent: "designer-agent",
      limit: 7,
      handoffLimit: 3,
      briefLimit: 2,
      includeClosed: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/designer/context?agent=designer-agent&channel=figma&limit=7&handoffLimit=3&briefLimit=2&includeClosed=true"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.context.channel, "figma");
});

test("get_review_context forwards review aggregate filters", async () => {
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
          context: {
            channel: "review",
            agent: "review-agent",
            workQueue: []
          }
        })
    };
  };

  const result = await callTool(
    "get_review_context",
    {
      agent: "review-agent",
      limit: 6,
      handoffLimit: 3,
      briefLimit: 2,
      includeClosed: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/review/context?agent=review-agent&limit=6&handoffLimit=3&briefLimit=2&includeClosed=true"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.context.channel, "review");
});

test("decide_review_thread posts review decision payload", async () => {
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
          handoff: { id: "handoff_review_001", status: "completed" },
          decision: { type: "approved" }
        })
    };
  };

  const result = await callTool(
    "decide_review_thread",
    {
      id: "thread_001",
      decision: "approved",
      agent: "review-agent",
      note: "Looks good"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/review/threads/thread_001/decision");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    decision: "approved",
    agent: "review-agent",
    note: "Looks good"
  });
  assert.equal(result.decision.type, "approved");
});

test("sync_pending_devlogs posts to automation devlog catch-up endpoint", async () => {
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
          ok: true,
          synced: 2,
          handoffs: ["handoff_001", "handoff_002"]
        })
    };
  };

  const result = await callTool(
    "sync_pending_devlogs",
    {
      agent: "devlog-agent",
      limit: 5,
      note: "bulk sync started",
      result: "bulk sync completed"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/automation/devlog/sync-pending");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    agent: "devlog-agent",
    limit: 5,
    note: "bulk sync started",
    result: "bulk sync completed"
  });
  assert.equal(result.synced, 2);
});

test("get_mailbox_unread_count forwards agent route and filters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url: String(url),
      options
    });
    return {
      ok: true,
      text: async () => JSON.stringify({ ok: true, agent: "alpha-agent", unreadCount: 2 })
    };
  };

  const result = await callTool(
    "get_mailbox_unread_count",
    {
      agent: "alpha-agent",
      channel: "bridge",
      threadId: "thread_2026_04_22_001",
      includeClosed: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/mailbox/alpha-agent/unread-count?channel=bridge&threadId=thread_2026_04_22_001&includeClosed=true"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.unreadCount, 2);
});

test("ack_mailbox posts cursor and threadId to ack route", async () => {
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
          ok: true,
          ack: { agent: "alpha-agent", lastReadAt: "2026-04-22T10:00:00.000Z" },
          unreadCount: 0
        })
    };
  };

  const result = await callTool(
    "ack_mailbox",
    {
      agent: "alpha-agent",
      cursor: "2026-04-22T10:00:00.000Z",
      threadId: "thread_2026_04_22_001"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/mailbox/alpha-agent/ack");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    cursor: "2026-04-22T10:00:00.000Z",
    threadId: "thread_2026_04_22_001"
  });
  assert.equal(result.unreadCount, 0);
});

test("create_thread posts to threads endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ thread: { id: "thread_001" } })
    };
  };

  await callTool(
    "create_thread",
    {
      channel: "bridge",
      sourceAgent: "bridge-agent",
      targetAgent: "review-agent",
      title: "Review toolbar layout"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/threads");
  assert.equal(calls[0].options.method, "POST");
});

test("list_threads forwards agent and includeReadState filters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ threads: [{ id: "thread_001", unread: true }] })
    };
  };

  const result = await callTool(
    "list_threads",
    {
      agent: "review-agent",
      includeReadState: true,
      channel: "bridge",
      targetAgent: "review-agent"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/threads?agent=review-agent&includeReadState=true&channel=bridge&targetAgent=review-agent"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.threads[0].unread, true);
});

test("get_thread forwards agent and includeReadState filters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ thread: { id: "thread_001", unread: false } })
    };
  };

  const result = await callTool(
    "get_thread",
    {
      id: "thread_001",
      agent: "review-agent",
      includeReadState: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/threads/thread_001?agent=review-agent&includeReadState=true"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.thread.id, "thread_001");
});

test("get_thread_context forwards thread context filters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          context: {
            thread: { id: "thread_001" },
            messages: [],
            handoffs: []
          }
        })
    };
  };

  const result = await callTool(
    "get_thread_context",
    {
      id: "thread_001",
      agent: "review-agent",
      messageLimit: 5,
      handoffLimit: 2,
      includeClosed: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/threads/thread_001/context?agent=review-agent&messageLimit=5&handoffLimit=2&includeClosed=true"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.context.thread.id, "thread_001");
});

test("create_thread_handoff posts linked handoff payload", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ handoff: { id: "handoff_001" } })
    };
  };

  await callTool(
    "create_thread_handoff",
    {
      id: "thread_001",
      payload: {
        type: "feature",
        title: "Review toolbar layout",
        date: "22 April, 2026",
        details: ["Review toolbar layout"],
        tags: ["thread"]
      }
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/threads/thread_001/handoffs");
  assert.equal(calls[0].options.method, "POST");
});

test("add_thread_deliverables posts artifact bundle to thread route", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          handoff: { id: "handoff_001" },
          addedArtifacts: 1,
          context: { assessment: { hasDeliverable: true } }
        })
    };
  };

  const result = await callTool(
    "add_thread_deliverables",
    {
      id: "thread_001",
      agent: "designer-agent",
      artifacts: [
        {
          type: "figma",
          path: "/tmp/landing.fig",
          label: "landing"
        }
      ],
      note: "hero update attached",
      claimIfPending: true,
      messageLimit: 8,
      handoffLimit: 3,
      includeClosed: true
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/threads/thread_001/deliverables");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    agent: "designer-agent",
    artifacts: [
      {
        type: "figma",
        path: "/tmp/landing.fig",
        label: "landing"
      }
    ],
    note: "hero update attached",
    claimIfPending: true,
    messageLimit: 8,
    handoffLimit: 3,
    includeClosed: true
  });
  assert.equal(result.context.assessment.hasDeliverable, true);
});

test("record_thread_verification posts verification payload to thread route", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          handoff: { id: "handoff_001", status: "completed" },
          verification: { status: "ready-for-handoff" },
          context: { assessment: { status: "ready-for-handoff" } }
        })
    };
  };

  const result = await callTool(
    "record_thread_verification",
    {
      id: "thread_001",
      status: "ready-for-handoff",
      agent: "designer-agent",
      criteria: [{ text: "CTA 유지", status: "pass" }],
      note: "CTA 유지 확인",
      completeIfReady: true,
      result: "handoff ready"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/threads/thread_001/verification");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    status: "ready-for-handoff",
    agent: "designer-agent",
    note: "CTA 유지 확인",
    criteria: [{ text: "CTA 유지", status: "pass" }],
    completeIfReady: true,
    result: "handoff ready"
  });
  assert.equal(result.handoff.status, "completed");
});

test("handoff_thread_for_review promotes ready design thread into review handoff", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const calls = [];
  const fetchImpl = async (url, options) => {
    const normalized = { url: String(url), options };
    calls.push(normalized);

    if (normalized.url === "http://127.0.0.1:3850/threads/thread_001/context?agent=designer-agent&includeClosed=true") {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            context: {
              thread: { id: "thread_001", title: "Hero redesign" },
              summary: { executionStage: "verify-and-handoff" },
              task: {
                objective: "히어로 메시지를 더 직접적으로 만든다.",
                designIntent: {
                  fileKey: "FILE_123",
                  nodeId: "817:417",
                  screenName: "Landing Hero",
                  designGoal: "히어로 메시지를 더 직접적으로 만든다.",
                  acceptanceCriteria: ["CTA 유지"]
                }
              },
              assets: {
                files: ["Landing.fig"],
                links: ["https://example.com/reference"],
                figmaDeliverables: [
                  { type: "figma", path: "/tmp/landing.fig", label: "landing" }
                ]
              },
              assessment: {
                status: "ready-for-review",
                hasDeliverable: true
              }
            }
          })
      };
    }

    if (normalized.url === "http://127.0.0.1:3850/threads/thread_001/handoffs") {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            thread: { id: "thread_001" },
            handoff: { id: "handoff_review_001", threadId: "thread_001", channel: "review", status: "pending" }
          })
      };
    }

    if (normalized.url === "http://127.0.0.1:3850/handoffs/handoff_review_001/artifacts") {
      return {
        ok: true,
        text: async () => JSON.stringify({ handoff: { id: "handoff_review_001" } })
      };
    }

    throw new Error(`Unexpected URL: ${normalized.url}`);
  };

  const result = await callTool(
    "handoff_thread_for_review",
    {
      id: "thread_001",
      agent: "designer-agent"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].url, "http://127.0.0.1:3850/threads/thread_001/handoffs");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    channel: "review",
    sourceAgent: "designer-agent",
    targetAgent: "review-agent",
    title: "Review: Hero redesign",
    payload: {
      type: "design-review",
      title: "Review: Hero redesign",
      date: today,
      summary: "히어로 메시지를 더 직접적으로 만든다.",
      details: ["acceptance: CTA 유지", "stage: verify-and-handoff", "assessment: ready-for-review"],
      tags: ["review", "figma"],
      files: ["Landing.fig"],
      links: ["https://example.com/reference"],
      figmaFileKey: "FILE_123",
      nodeId: "817:417",
      screenName: "Landing Hero",
      designGoal: "히어로 메시지를 더 직접적으로 만든다.",
      acceptanceCriteria: ["CTA 유지"]
    }
  });
  assert.equal(calls[2].url, "http://127.0.0.1:3850/handoffs/handoff_review_001/artifacts");
  assert.equal(result.reviewHandoff.id, "handoff_review_001");
  assert.equal(result.attachedArtifacts.length, 1);
});

test("get_dashboard_snapshot reads dashboard snapshot endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ ok: true, snapshot: { summary: { totalHandoffs: 3 } } })
    };
  };

  const result = await callTool(
    "get_dashboard_snapshot",
    {},
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/dashboard/snapshot");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.snapshot.summary.totalHandoffs, 3);
});

test("get_channel_entry reads channel entry endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ ok: true, entry: { id: "handoff_001" } })
    };
  };

  const result = await callTool(
    "get_channel_entry",
    {
      channel: "docs",
      id: "handoff_001"
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:3850/channels/docs/entries/handoff_001");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.entry.id, "handoff_001");
});

test("poll_mailbox_stream returns first mailbox event payload", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url: String(url),
      options
    });
    return {
      ok: true,
      body: null,
      text: async () =>
        [
          "event: ready",
          "data: {\"stream\":\"mailbox\"}",
          "",
          "event: mailbox",
          "data: {\"ok\":true,\"mailbox\":{\"cursor\":\"2026-04-07T00:10:00.000Z\"}}",
          "",
          ""
        ].join("\n")
    };
  };

  const result = await callTool(
    "poll_mailbox_stream",
    {
      agent: "alpha-agent",
      after: "cursor_123",
      interval: 1000
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/mailbox/stream?agent=alpha-agent&after=cursor_123&interval=1000"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.event, "mailbox");
  assert.equal(result.data.ok, true);
});

test("poll_conversation_stream returns heartbeat when no delta event appears", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url: String(url),
      options
    });
    return {
      ok: true,
      body: null,
      text: async () =>
        [
          "event: ready",
          "data: {\"stream\":\"conversation\"}",
          "",
          "event: heartbeat",
          "data: {\"stream\":\"conversation\",\"handoffId\":\"handoff_001\"}",
          "",
          ""
        ].join("\n")
    };
  };

  const result = await callTool(
    "poll_conversation_stream",
    {
      id: "handoff_001",
      after: "cursor_123",
      interval: 1000
    },
    {
      baseUrl: "http://127.0.0.1:3850",
      fetchImpl
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "http://127.0.0.1:3850/handoffs/handoff_001/conversation/stream?after=cursor_123&interval=1000"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.event, "heartbeat");
  assert.equal(result.data.stream, "conversation");
});
