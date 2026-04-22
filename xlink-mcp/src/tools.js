const TOOL_DEFINITIONS = [
  {
    name: "create_handoff",
    description: "Create a new handoff in the xlink coordinator.",
    inputSchema: {
      type: "object",
      required: ["channel", "targetAgent", "sourceAgent", "title", "payload"],
      properties: {
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        targetAgent: { type: "string" },
        sourceAgent: { type: "string" },
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        payload: { type: "object" },
        artifacts: { type: "array" },
        messages: { type: "array" }
      }
    }
  },
  {
    name: "list_handoffs",
    description: "List handoffs with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "claimed", "completed", "rejected", "blocked"] },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        targetAgent: { type: "string" },
        sourceAgent: { type: "string" }
      }
    }
  },
  {
    name: "claim_handoff",
    description: "Claim a pending handoff for an agent.",
    inputSchema: {
      type: "object",
      required: ["id", "agent"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        note: { type: "string" }
      }
    }
  },
  {
    name: "complete_handoff",
    description: "Complete a claimed or blocked handoff with a result message.",
    inputSchema: {
      type: "object",
      required: ["id", "agent", "result"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        result: { type: "string" }
      }
    }
  },
  {
    name: "block_handoff",
    description: "Mark a pending or claimed handoff as blocked.",
    inputSchema: {
      type: "object",
      required: ["id", "agent", "reason"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "reject_handoff",
    description: "Reject a pending or claimed handoff with a reason.",
    inputSchema: {
      type: "object",
      required: ["id", "agent", "reason"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "add_artifact",
    description: "Attach an artifact path to an existing handoff.",
    inputSchema: {
      type: "object",
      required: ["id", "type", "path"],
      properties: {
        id: { type: "string" },
        type: { type: "string" },
        path: { type: "string" },
        label: { type: "string" }
      }
    }
  },
  {
    name: "append_message",
    description: "Append an informational message to a handoff without changing status.",
    inputSchema: {
      type: "object",
      required: ["id", "author", "body"],
      properties: {
        id: { type: "string" },
        author: { type: "string" },
        body: { type: "string" },
        kind: { type: "string" }
      }
    }
  },
  {
    name: "get_handoff",
    description: "Fetch a single handoff by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }
      }
    }
  },
  {
    name: "get_mailbox",
    description: "Poll the mailbox for agent-relevant handoffs and recent conversation updates.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        status: { type: "string", enum: ["pending", "claimed", "completed", "rejected", "blocked"] },
        after: { type: "string" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "get_mailbox_unread_count",
    description: "Return unread mailbox count for a target agent based on the latest ack cursor.",
    inputSchema: {
      type: "object",
      required: ["agent"],
      properties: {
        agent: { type: "string" },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        threadId: { type: "string" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "ack_mailbox",
    description: "Advance an agent mailbox read cursor so existing handoffs are treated as read.",
    inputSchema: {
      type: "object",
      required: ["agent"],
      properties: {
        agent: { type: "string" },
        cursor: { type: "string" },
        threadId: { type: "string" }
      }
    }
  },
  {
    name: "list_threads",
    description: "List conversation threads with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        includeReadState: { type: "boolean" },
        status: { type: "string", enum: ["open", "resolved", "archived"] },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        targetAgent: { type: "string" },
        sourceAgent: { type: "string" }
      }
    }
  },
  {
    name: "create_thread",
    description: "Create a standalone collaboration thread.",
    inputSchema: {
      type: "object",
      required: ["channel", "sourceAgent", "targetAgent", "title"],
      properties: {
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        sourceAgent: { type: "string" },
        targetAgent: { type: "string" },
        title: { type: "string" }
      }
    }
  },
  {
    name: "get_thread",
    description: "Fetch a single thread by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        includeReadState: { type: "boolean" }
      }
    }
  },
  {
    name: "get_thread_context",
    description: "Fetch aggregated thread context for a single thread.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        messageLimit: { type: "number" },
        handoffLimit: { type: "number" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "get_thread_messages",
    description: "Fetch the message list for a thread.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }
      }
    }
  },
  {
    name: "append_thread_message",
    description: "Append a message directly to a thread.",
    inputSchema: {
      type: "object",
      required: ["id", "author", "body"],
      properties: {
        id: { type: "string" },
        author: { type: "string" },
        body: { type: "string" },
        kind: { type: "string" }
      }
    }
  },
  {
    name: "create_thread_handoff",
    description: "Create a handoff linked to an existing thread.",
    inputSchema: {
      type: "object",
      required: ["id", "payload"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        sourceAgent: { type: "string" },
        targetAgent: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        payload: { type: "object" }
      }
    }
  },
  {
    name: "add_thread_deliverables",
    description: "Attach one or more deliverable artifacts to the active handoff linked to a thread.",
    inputSchema: {
      type: "object",
      required: ["id", "artifacts"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        artifacts: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "path"],
            properties: {
              type: { type: "string" },
              path: { type: "string" },
              label: { type: "string" }
            }
          }
        },
        note: { type: "string" },
        claimIfPending: { type: "boolean" },
        claimNote: { type: "string" },
        messageLimit: { type: "number" },
        handoffLimit: { type: "number" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "record_thread_verification",
    description: "Record verification status for the active handoff linked to a thread and optionally complete or block it.",
    inputSchema: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string" },
        status: { type: "string" },
        agent: { type: "string" },
        summary: { type: "string" },
        note: { type: "string" },
        kind: { type: "string" },
        criteria: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  text: { type: "string" },
                  label: { type: "string" },
                  status: { type: "string" }
                }
              }
            ]
          }
        },
        claimIfPending: { type: "boolean" },
        claimNote: { type: "string" },
        autoBlock: { type: "boolean" },
        blockReason: { type: "string" },
        completeIfReady: { type: "boolean" },
        result: { type: "string" },
        messageLimit: { type: "number" },
        handoffLimit: { type: "number" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "handoff_thread_for_review",
    description: "Promote a design thread into the review stage by recording readiness, creating a linked review handoff, and carrying over deliverables.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        sourceAgent: { type: "string" },
        targetAgent: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        note: { type: "string" },
        criteria: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  text: { type: "string" },
                  label: { type: "string" },
                  status: { type: "string" }
                }
              }
            ]
          }
        },
        completeIfReady: { type: "boolean" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "get_conversation",
    description: "Inspect the full conversation state for a handoff.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        after: { type: "string" }
      }
    }
  },
  {
    name: "get_designer_context",
    description: "Read aggregated designer-facing context from the consumer surface.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        limit: { type: "number" },
        handoffLimit: { type: "number" },
        briefLimit: { type: "number" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "get_review_context",
    description: "Read aggregated review-facing context from the consumer surface.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        limit: { type: "number" },
        handoffLimit: { type: "number" },
        briefLimit: { type: "number" },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "decide_review_thread",
    description: "Record a review decision for the active review handoff on a thread and optionally create a design follow-up.",
    inputSchema: {
      type: "object",
      required: ["id", "decision"],
      properties: {
        id: { type: "string" },
        decision: { type: "string", enum: ["approved", "changes-requested", "blocked"] },
        agent: { type: "string" },
        summary: { type: "string" },
        note: { type: "string" },
        result: { type: "string" },
        reason: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        targetAgent: { type: "string" },
        sourceAgent: { type: "string" },
        claimIfPending: { type: "boolean" },
        claimNote: { type: "string" },
        createFollowup: { type: "boolean" },
        followupTitle: { type: "string" },
        followupSummary: { type: "string" },
        followupType: { type: "string" },
        followupDetails: { type: "array", items: { type: "string" } },
        includeClosed: { type: "boolean" }
      }
    }
  },
  {
    name: "poll_mailbox_stream",
    description: "Read a single mailbox update event from the mailbox SSE stream.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] },
        status: { type: "string", enum: ["pending", "claimed", "completed", "rejected", "blocked"] },
        after: { type: "string" },
        includeClosed: { type: "boolean" },
        interval: { type: "number" },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "poll_conversation_stream",
    description: "Read a single conversation delta event from the conversation SSE stream.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        after: { type: "string" },
        since: { type: "string" },
        interval: { type: "number" },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "append_reply",
    description: "Append a reply message to a handoff conversation.",
    inputSchema: {
      type: "object",
      required: ["id", "author", "body"],
      properties: {
        id: { type: "string" },
        author: { type: "string" },
        body: { type: "string" },
        kind: { type: "string" }
      }
    }
  },
  {
    name: "get_dashboard_snapshot",
    description: "Read the generated dashboard snapshot JSON.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "list_channel_entries",
    description: "List ingested projection entries for a channel.",
    inputSchema: {
      type: "object",
      required: ["channel"],
      properties: {
        channel: { type: "string", enum: ["bridge", "figma", "docs", "review"] }
      }
    }
  },
  {
    name: "get_channel_entry",
    description: "Read a single ingested projection entry by id.",
    inputSchema: {
      type: "object",
      required: ["channel", "id"],
      properties: {
        channel: { type: "string", enum: ["bridge", "figma", "docs", "review"] },
        id: { type: "string" }
      }
    }
  },
  {
    name: "preview_devlog_card",
    description: "Project a devlog handoff into the devlog card ingestion format.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }
      }
    }
  },
  {
    name: "preview_projection",
    description: "Project a handoff into a channel-specific consumer format.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        channel: { type: "string", enum: ["devlog", "bridge", "figma", "docs", "review"] }
      }
    }
  },
  {
    name: "ingest_devlog_card",
    description: "Ingest a devlog handoff into the configured devlog data store.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }
      }
    }
  },
  {
    name: "sync_devlog_handoff",
    description: "Claim if needed, ingest the devlog card, and complete the handoff in one workflow.",
    inputSchema: {
      type: "object",
      required: ["id", "agent"],
      properties: {
        id: { type: "string" },
        agent: { type: "string" },
        note: { type: "string" },
        result: { type: "string" }
      }
    }
  },
  {
    name: "sync_pending_devlogs",
    description: "Bulk-sync pending devlog handoffs through the automation catch-up endpoint.",
    inputSchema: {
      type: "object",
      required: ["agent"],
      properties: {
        agent: { type: "string" },
        limit: { type: "number" },
        note: { type: "string" },
        result: { type: "string" }
      }
    }
  },
  {
    name: "ingest_projection",
    description: "Ingest a non-devlog channel projection into its configured local store.",
    inputSchema: {
      type: "object",
      required: ["id", "channel"],
      properties: {
        id: { type: "string" },
        channel: { type: "string", enum: ["bridge", "figma", "docs", "review"] }
      }
    }
  },
  {
    name: "sync_handoff_channel",
    description: "Claim if needed, ingest a channel projection, and complete the handoff.",
    inputSchema: {
      type: "object",
      required: ["id", "channel", "agent"],
      properties: {
        id: { type: "string" },
        channel: { type: "string", enum: ["bridge", "figma", "docs", "review"] },
        agent: { type: "string" },
        note: { type: "string" },
        result: { type: "string" }
      }
    }
  },
  {
    name: "validate_xbridge_compose",
    description:
      "Validate a handoff payload against Xbridge compose contract and optionally auto-block the handoff on failure.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        payload: { type: "object" },
        xbridgeBaseUrl: { type: "string" },
        recordMessage: { type: "boolean" },
        author: { type: "string" },
        note: { type: "string" },
        kind: { type: "string" },
        autoRetryOnFailure: { type: "boolean" },
        defaultParentId: { type: "string" },
        fallbackIntentSections: { type: "array" },
        retryPolicy: { type: "object" },
        autoBlockOnFailure: { type: "boolean" },
        blockReason: { type: "string" }
      }
    }
  }
];

function buildUrl(baseUrl, pathname, query) {
  const url = new URL(pathname, baseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  return url;
}

async function requestJson(baseUrl, pathname, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(buildUrl(baseUrl, pathname, options.query), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload.error ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildReviewPayloadFromContext(context, args = {}) {
  const designIntent = context?.task?.designIntent ?? {};
  const summary = args.summary ?? context?.task?.objective ?? context?.thread?.title ?? "Review design handoff";
  const criteria = Array.isArray(designIntent.acceptanceCriteria) ? designIntent.acceptanceCriteria : [];
  const details = []
    .concat(criteria.length > 0 ? criteria.map((item) => `acceptance: ${item}`) : [])
    .concat(context?.summary?.executionStage ? [`stage: ${context.summary.executionStage}`] : [])
    .concat(context?.assessment?.status ? [`assessment: ${context.assessment.status}`] : []);

  return {
    type: "design-review",
    title: args.title ?? `Review: ${context?.thread?.title ?? "design thread"}`,
    date: todayIsoDate(),
    summary,
    details,
    tags: ["review", "figma"],
    files: Array.isArray(context?.assets?.files) ? context.assets.files : [],
    links: Array.isArray(context?.assets?.links) ? context.assets.links : [],
    figmaFileKey: designIntent.fileKey ?? null,
    nodeId: designIntent.nodeId ?? null,
    screenName: designIntent.screenName ?? null,
    designGoal: designIntent.designGoal ?? null,
    acceptanceCriteria: criteria
  };
}

function parseSseEventBlock(block) {
  const lines = String(block || "")
    .split("\n")
    .map((line) => line.trimEnd());
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const rawData = dataLines.join("\n");
  let data = rawData;
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
  }

  return {
    event,
    data
  };
}

async function requestSingleSseEvent(baseUrl, pathname, options = {}, fetchImpl = fetch) {
  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.trunc(options.timeoutMs)
      : 5000;
  const targets = new Set(options.targetEvents ?? []);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetchImpl(buildUrl(baseUrl, pathname, options.query), {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      ...(options.headers ?? {})
    },
    signal: controller.signal
  });

  if (!response.ok) {
    clearTimeout(timeout);
    const text = typeof response.text === "function" ? await response.text() : "";
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }
    const message = payload.error ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  const tryEvents = (rawText) => {
    let buffer = String(rawText || "").replaceAll("\r\n", "\n");
    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex === -1) {
        return { matched: null, buffer };
      }
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const parsed = parseSseEventBlock(block);

      if (parsed.event === "error") {
        const errorMessage =
          typeof parsed.data === "object" && parsed.data && parsed.data.message
            ? parsed.data.message
            : "SSE stream returned error event";
        throw new Error(errorMessage);
      }

      if (targets.has(parsed.event)) {
        return { matched: parsed, buffer };
      }
    }
  };

  try {
    if (response.body?.getReader) {
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          const flush = tryEvents(buffer);
          if (flush.matched) {
            return flush.matched;
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const result = tryEvents(buffer);
        buffer = result.buffer;
        if (result.matched) {
          return result.matched;
        }
      }
    }

    if (typeof response.text === "function") {
      const text = await response.text();
      const result = tryEvents(text);
      if (result.matched) {
        return result.matched;
      }
    }

    throw new Error("No matching SSE event found");
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timed out waiting for SSE event (${timeoutMs}ms)`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export function listTools() {
  return TOOL_DEFINITIONS;
}

export async function callTool(name, args, options = {}) {
  const baseUrl = options.baseUrl ?? process.env.XLINK_BASE_URL ?? "http://127.0.0.1:3850";
  const fetchImpl = options.fetchImpl ?? fetch;

  switch (name) {
    case "create_handoff":
      return requestJson(baseUrl, "/handoffs", { method: "POST", body: args }, fetchImpl);
    case "list_handoffs":
      return requestJson(baseUrl, "/handoffs", { query: args }, fetchImpl);
    case "get_handoff":
      return requestJson(baseUrl, `/handoffs/${args.id}`, {}, fetchImpl);
    case "get_mailbox":
      return requestJson(baseUrl, "/mailbox", { query: args }, fetchImpl);
    case "get_mailbox_unread_count":
      return requestJson(baseUrl, `/mailbox/${encodeURIComponent(args.agent)}/unread-count`, {
        query: {
          channel: args.channel,
          threadId: args.threadId,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "ack_mailbox":
      return requestJson(baseUrl, `/mailbox/${encodeURIComponent(args.agent)}/ack`, {
        method: "POST",
        body: {
          cursor: args.cursor,
          threadId: args.threadId
        }
      }, fetchImpl);
    case "list_threads":
      return requestJson(baseUrl, "/threads", {
        query: {
          agent: args.agent,
          includeReadState: args.includeReadState,
          status: args.status,
          channel: args.channel,
          targetAgent: args.targetAgent,
          sourceAgent: args.sourceAgent
        }
      }, fetchImpl);
    case "create_thread":
      return requestJson(baseUrl, "/threads", { method: "POST", body: args }, fetchImpl);
    case "get_thread":
      return requestJson(baseUrl, `/threads/${args.id}`, {
        query: {
          agent: args.agent,
          includeReadState: args.includeReadState
        }
      }, fetchImpl);
    case "get_thread_context":
      return requestJson(baseUrl, `/threads/${args.id}/context`, {
        query: {
          agent: args.agent,
          messageLimit: args.messageLimit,
          handoffLimit: args.handoffLimit,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "get_thread_messages":
      return requestJson(baseUrl, `/threads/${args.id}/messages`, {}, fetchImpl);
    case "append_thread_message":
      return requestJson(baseUrl, `/threads/${args.id}/messages`, {
        method: "POST",
        body: {
          author: args.author,
          body: args.body,
          kind: args.kind
        }
      }, fetchImpl);
    case "create_thread_handoff":
      return requestJson(baseUrl, `/threads/${args.id}/handoffs`, {
        method: "POST",
        body: {
          title: args.title,
          channel: args.channel,
          sourceAgent: args.sourceAgent,
          targetAgent: args.targetAgent,
          priority: args.priority,
          payload: args.payload
        }
      }, fetchImpl);
    case "add_thread_deliverables":
      return requestJson(baseUrl, `/threads/${args.id}/deliverables`, {
        method: "POST",
        body: {
          agent: args.agent,
          artifacts: args.artifacts,
          note: args.note,
          claimIfPending: args.claimIfPending,
          claimNote: args.claimNote,
          messageLimit: args.messageLimit,
          handoffLimit: args.handoffLimit,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "record_thread_verification":
      return requestJson(baseUrl, `/threads/${args.id}/verification`, {
        method: "POST",
        body: {
          status: args.status,
          agent: args.agent,
          summary: args.summary,
          note: args.note,
          kind: args.kind,
          criteria: args.criteria,
          claimIfPending: args.claimIfPending,
          claimNote: args.claimNote,
          autoBlock: args.autoBlock,
          blockReason: args.blockReason,
          completeIfReady: args.completeIfReady,
          result: args.result,
          messageLimit: args.messageLimit,
          handoffLimit: args.handoffLimit,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "handoff_thread_for_review": {
      const agent = args.agent ?? "designer-agent";
      const includeClosed = args.includeClosed ?? true;
      let contextPayload = await requestJson(baseUrl, `/threads/${args.id}/context`, {
        query: {
          agent,
          includeClosed
        }
      }, fetchImpl);

      const status = contextPayload?.context?.assessment?.status ?? null;
      const readyStatuses = new Set(["ready-for-review", "ready-for-handoff"]);

      if (!readyStatuses.has(status)) {
        await requestJson(baseUrl, `/threads/${args.id}/verification`, {
          method: "POST",
          body: {
            agent,
            status: "ready-for-review",
            criteria: args.criteria,
            note: args.note,
            completeIfReady: args.completeIfReady ?? true,
            includeClosed
          }
        }, fetchImpl);

        contextPayload = await requestJson(baseUrl, `/threads/${args.id}/context`, {
          query: {
            agent,
            includeClosed
          }
        }, fetchImpl);
      }

      const reviewPayload = buildReviewPayloadFromContext(contextPayload.context, args);
      const createResult = await requestJson(baseUrl, `/threads/${args.id}/handoffs`, {
        method: "POST",
        body: {
          channel: "review",
          sourceAgent: args.sourceAgent ?? agent,
          targetAgent: args.targetAgent ?? "review-agent",
          priority: args.priority,
          title: args.title ?? reviewPayload.title,
          payload: reviewPayload
        }
      }, fetchImpl);

      const reviewHandoff = createResult?.handoff ?? null;
      const deliverables = Array.isArray(contextPayload?.context?.assets?.figmaDeliverables)
        ? contextPayload.context.assets.figmaDeliverables
        : [];
      const attachedArtifacts = [];

      if (reviewHandoff?.id) {
        for (const deliverable of deliverables) {
          if (!deliverable?.type || !deliverable?.path) {
            continue;
          }
          await requestJson(baseUrl, `/handoffs/${reviewHandoff.id}/artifacts`, {
            method: "POST",
            body: {
              type: deliverable.type,
              path: deliverable.path,
              label: deliverable.label
            }
          }, fetchImpl);
          attachedArtifacts.push({
            type: deliverable.type,
            path: deliverable.path,
            label: deliverable.label ?? null
          });
        }
      }

      return {
        threadId: args.id,
        reviewHandoff,
        attachedArtifacts,
        sourceAssessment: contextPayload?.context?.assessment ?? null,
        sourceThread: contextPayload?.context?.thread ?? null
      };
    }
    case "get_conversation":
      return requestJson(baseUrl, `/handoffs/${args.id}/conversation`, {
        query: {
          after: args.after
        }
      }, fetchImpl);
    case "get_designer_context":
      return requestJson(baseUrl, "/designer/context", {
        query: {
          agent: args.agent,
          channel: args.channel ?? "figma",
          limit: args.limit,
          handoffLimit: args.handoffLimit,
          briefLimit: args.briefLimit,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "get_review_context":
      return requestJson(baseUrl, "/review/context", {
        query: {
          agent: args.agent,
          limit: args.limit,
          handoffLimit: args.handoffLimit,
          briefLimit: args.briefLimit,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "decide_review_thread":
      return requestJson(baseUrl, `/review/threads/${args.id}/decision`, {
        method: "POST",
        body: {
          decision: args.decision,
          agent: args.agent,
          summary: args.summary,
          note: args.note,
          result: args.result,
          reason: args.reason,
          priority: args.priority,
          targetAgent: args.targetAgent,
          sourceAgent: args.sourceAgent,
          claimIfPending: args.claimIfPending,
          claimNote: args.claimNote,
          createFollowup: args.createFollowup,
          followupTitle: args.followupTitle,
          followupSummary: args.followupSummary,
          followupType: args.followupType,
          followupDetails: args.followupDetails,
          includeClosed: args.includeClosed
        }
      }, fetchImpl);
    case "get_dashboard_snapshot":
      return requestJson(baseUrl, "/dashboard/snapshot", {}, fetchImpl);
    case "list_channel_entries":
      return requestJson(baseUrl, `/channels/${encodeURIComponent(args.channel)}/entries`, {}, fetchImpl);
    case "get_channel_entry":
      return requestJson(baseUrl, `/channels/${encodeURIComponent(args.channel)}/entries/${encodeURIComponent(args.id)}`, {}, fetchImpl);
    case "poll_mailbox_stream":
      return requestSingleSseEvent(baseUrl, "/mailbox/stream", {
        query: {
          agent: args.agent,
          channel: args.channel,
          status: args.status,
          after: args.after,
          includeClosed: args.includeClosed,
          interval: args.interval
        },
        timeoutMs: args.timeoutMs,
        targetEvents: ["mailbox", "heartbeat"]
      }, fetchImpl);
    case "poll_conversation_stream":
      return requestSingleSseEvent(baseUrl, `/handoffs/${args.id}/conversation/stream`, {
        query: {
          after: args.after,
          since: args.since,
          interval: args.interval
        },
        timeoutMs: args.timeoutMs,
        targetEvents: ["conversation", "heartbeat"]
      }, fetchImpl);
    case "append_reply":
      return requestJson(baseUrl, `/handoffs/${args.id}/reply`, {
        method: "POST",
        body: {
          author: args.author,
          body: args.body,
          kind: args.kind
        }
      }, fetchImpl);
    case "preview_devlog_card":
      return requestJson(baseUrl, `/handoffs/${args.id}/devlog-card`, {}, fetchImpl);
    case "preview_projection":
      return requestJson(baseUrl, `/handoffs/${args.id}/projection`, {
        query: {
          channel: args.channel
        }
      }, fetchImpl);
    case "ingest_devlog_card":
      return requestJson(baseUrl, `/handoffs/${args.id}/devlog-ingest`, { method: "POST" }, fetchImpl);
    case "sync_devlog_handoff":
      return requestJson(baseUrl, `/handoffs/${args.id}/devlog-sync`, {
        method: "POST",
        body: {
          agent: args.agent,
          note: args.note,
          result: args.result
        }
      }, fetchImpl);
    case "sync_pending_devlogs":
      return requestJson(baseUrl, "/automation/devlog/sync-pending", {
        method: "POST",
        body: {
          agent: args.agent,
          limit: args.limit,
          note: args.note,
          result: args.result
        }
      }, fetchImpl);
    case "ingest_projection":
      return requestJson(baseUrl, `/handoffs/${args.id}/channel-ingest`, {
        method: "POST",
        body: {
          channel: args.channel
        }
      }, fetchImpl);
    case "sync_handoff_channel":
      return requestJson(baseUrl, `/handoffs/${args.id}/channel-sync`, {
        method: "POST",
        body: {
          channel: args.channel,
          agent: args.agent,
          note: args.note,
          result: args.result
        }
      }, fetchImpl);
    case "validate_xbridge_compose":
      return requestJson(baseUrl, `/handoffs/${args.id}/xbridge-validate`, {
        method: "POST",
        body: {
          payload: args.payload,
          baseUrl: args.xbridgeBaseUrl,
          recordMessage: args.recordMessage,
          author: args.author,
          note: args.note,
          kind: args.kind,
          autoRetryOnFailure: args.autoRetryOnFailure,
          defaultParentId: args.defaultParentId,
          fallbackIntentSections: args.fallbackIntentSections,
          retryPolicy: args.retryPolicy,
          autoBlockOnFailure: args.autoBlockOnFailure,
          blockReason: args.blockReason
        }
      }, fetchImpl);
    case "claim_handoff":
      return requestJson(baseUrl, `/handoffs/${args.id}/claim`, {
        method: "POST",
        body: {
          agent: args.agent,
          note: args.note
        }
      }, fetchImpl);
    case "complete_handoff":
      return requestJson(baseUrl, `/handoffs/${args.id}/complete`, {
        method: "POST",
        body: {
          agent: args.agent,
          result: args.result
        }
      }, fetchImpl);
    case "block_handoff":
      return requestJson(baseUrl, `/handoffs/${args.id}/block`, {
        method: "POST",
        body: {
          agent: args.agent,
          reason: args.reason
        }
      }, fetchImpl);
    case "reject_handoff":
      return requestJson(baseUrl, `/handoffs/${args.id}/reject`, {
        method: "POST",
        body: {
          agent: args.agent,
          reason: args.reason
        }
      }, fetchImpl);
    case "add_artifact":
      return requestJson(baseUrl, `/handoffs/${args.id}/artifacts`, {
        method: "POST",
        body: {
          type: args.type,
          path: args.path,
          label: args.label
        }
      }, fetchImpl);
    case "append_message":
      return requestJson(baseUrl, `/handoffs/${args.id}/messages`, {
        method: "POST",
        body: {
          author: args.author,
          body: args.body,
          kind: args.kind
        }
      }, fetchImpl);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
