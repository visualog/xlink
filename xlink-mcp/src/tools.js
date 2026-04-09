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
    name: "get_conversation",
    description: "Inspect the full conversation state for a handoff.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }
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
    case "get_conversation":
      return requestJson(baseUrl, `/handoffs/${args.id}/conversation`, {}, fetchImpl);
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
