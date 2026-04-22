import { json, readJsonBody } from "../http.js";
import { buildThreadInbox } from "../mailbox.js";
import { buildThreadContextPacket } from "../thread-context.js";
import { StoreError } from "../store.js";

function shouldIncludeThreadSummaries(searchParams) {
  return searchParams.get("includeReadState") === "true" || Boolean(searchParams.get("agent"));
}

function getThreadRouteFilters(searchParams, threadId) {
  return {
    threadId,
    status: searchParams.get("status") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    targetAgent: searchParams.get("targetAgent") ?? undefined,
    sourceAgent: searchParams.get("sourceAgent") ?? undefined,
    updatedSince: searchParams.get("after") ?? undefined
  };
}

function getHandoffFiltersForThreadRoute(searchParams, threadId) {
  return {
    threadId,
    channel: searchParams.get("channel") ?? undefined,
    targetAgent: searchParams.get("targetAgent") ?? undefined,
    sourceAgent: searchParams.get("sourceAgent") ?? undefined,
    updatedSince: searchParams.get("after") ?? undefined
  };
}

async function buildThreadSummaries(store, searchParams, threadId) {
  const agent = searchParams.get("agent") ?? undefined;
  const [threads, handoffs, readState, readStates] = await Promise.all([
    store.listThreads(getThreadRouteFilters(searchParams, threadId)),
    store.list(getHandoffFiltersForThreadRoute(searchParams, threadId)),
    agent ? store.getMailboxReadState(agent, { threadId }) : Promise.resolve(null),
    agent && typeof store.listMailboxReadStates === "function" ? store.listMailboxReadStates(agent) : Promise.resolve([])
  ]);
  const readStateByThread = Object.fromEntries(
    (readStates ?? [])
      .filter((item) => item?.threadId)
      .map((item) => [item.threadId, item.lastReadAt ?? null])
  );
  const summaries = buildThreadInbox(threads, handoffs, {
    agent,
    threadId,
    status: searchParams.get("status") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    targetAgent: searchParams.get("targetAgent") ?? undefined,
    sourceAgent: searchParams.get("sourceAgent") ?? undefined,
    after: searchParams.get("after") ?? undefined,
    lastReadAt: readState?.globalLastReadAt ?? readState?.lastReadAt ?? null,
    readStateByThread
  });

  return {
    summaries,
    mailbox: {
      agent,
      threadId: threadId ?? null,
      unreadCount: summaries.filter((item) => item.unread).length,
      total: summaries.length
    },
    readState: readState ?? null
  };
}

function enrichThread(thread, summary, readState) {
  if (!summary) {
    return thread;
  }

  return {
    ...thread,
    unread: summary.unread,
    lastReadAt: summary.lastReadAt ?? null,
    latestHandoffId: summary.latestHandoffId ?? null,
    latestHandoffStatus: summary.latestHandoffStatus ?? null,
    latestHandoff: summary.latestHandoff ?? null,
    handoffCount: summary.handoffCount ?? 0,
    messageCount: summary.messageCount ?? (Array.isArray(thread.messages) ? thread.messages.length : 0),
    lastMessage: summary.lastMessage ?? null,
    globalLastReadAt: readState?.globalLastReadAt ?? null,
    threadLastReadAt: readState?.threadLastReadAt ?? null
  };
}

function pickActiveThreadHandoff(handoffs = []) {
  const priority = ["claimed", "pending", "blocked", "rejected", "completed"];

  for (const status of priority) {
    const found = handoffs.find((handoff) => handoff.status === status);
    if (found) {
      return found;
    }
  }

  return handoffs[0] ?? null;
}

async function resolvePrimaryThreadHandoff(store, threadId) {
  const handoffs = await store.list({ threadId });
  const handoff = pickActiveThreadHandoff(handoffs);

  if (!handoff) {
    throw new StoreError(404, `thread ${threadId} does not have any linked handoffs.`);
  }

  return handoff;
}

function normalizeDeliverableInputs(body = {}) {
  if (Array.isArray(body.artifacts) && body.artifacts.length > 0) {
    return body.artifacts;
  }

  if (body.artifact && typeof body.artifact === "object") {
    return [body.artifact];
  }

  if (body.type && body.path) {
    return [
      {
        type: body.type,
        path: body.path,
        label: body.label
      }
    ];
  }

  return [];
}

function buildVerificationMessage(body = {}) {
  if (typeof body.summary === "string" && body.summary.trim()) {
    return body.summary.trim();
  }

  const parts = [];
  const status = String(body.status || "").trim();
  if (status) {
    parts.push(`verification ${status}`);
  }

  if (Array.isArray(body.criteria) && body.criteria.length > 0) {
    const summarized = body.criteria
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        const text = String(item?.text || item?.label || "").trim();
        const itemStatus = String(item?.status || "").trim();
        return [text, itemStatus].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .join(" | ");

    if (summarized) {
      parts.push(summarized);
    }
  }

  if (typeof body.note === "string" && body.note.trim()) {
    parts.push(body.note.trim());
  }

  return parts.join(" · ") || "verification updated";
}

export function createThreadRoutes(store, projectionStores = new Map()) {
  return async function handleThreadRoute(request, response, url, pathParts) {
    if (request.method === "GET" && url.pathname === "/threads") {
      const threads = await store.listThreads(getThreadRouteFilters(url.searchParams));
      const payload = { threads };

      if (shouldIncludeThreadSummaries(url.searchParams)) {
        const { summaries, mailbox } = await buildThreadSummaries(store, url.searchParams);
        const summaryMap = new Map(summaries.map((summary) => [summary.id, summary]));
        payload.threads = threads.map((thread) => enrichThread(thread, summaryMap.get(thread.id)));
        payload.summaries = summaries;
        payload.mailbox = mailbox;
      }

      json(response, 200, payload);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/threads") {
      const body = await readJsonBody(request);
      const thread = await store.createThread(body);
      json(response, 201, { thread });
      return true;
    }

    if (pathParts[0] !== "threads" || pathParts.length < 2) {
      return false;
    }

    const id = pathParts[1];

    if (request.method === "GET" && pathParts.length === 2) {
      const thread = await store.getThreadById(id);
      const payload = { thread };

      if (shouldIncludeThreadSummaries(url.searchParams)) {
        const { summaries, readState } = await buildThreadSummaries(store, url.searchParams, id);
        payload.summary = summaries[0] ?? null;
        payload.thread = enrichThread(thread, payload.summary, readState);
        payload.readState = readState;
      }

      json(response, 200, payload);
      return true;
    }

    if (request.method === "GET" && pathParts[2] === "context") {
      const context = await buildThreadContextPacket(store, projectionStores, id, {
        agent: url.searchParams.get("agent") ?? undefined,
        messageLimit: url.searchParams.get("messageLimit") ?? undefined,
        handoffLimit: url.searchParams.get("handoffLimit") ?? undefined,
        includeClosed: url.searchParams.get("includeClosed") === "true"
      });
      json(response, 200, { context });
      return true;
    }

    if (request.method === "GET" && pathParts[2] === "messages") {
      const thread = await store.getThreadById(id);
      json(response, 200, {
        thread,
        messages: Array.isArray(thread.messages) ? thread.messages : []
      });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "messages") {
      const body = await readJsonBody(request);
      const thread = await store.appendThreadMessage(id, body);
      json(response, 200, { thread });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "handoffs") {
      const body = await readJsonBody(request);
      const result = await store.createThreadHandoff(id, body);
      json(response, 201, result);
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "deliverables") {
      const body = await readJsonBody(request);
      let handoff = await resolvePrimaryThreadHandoff(store, id);
      const agent = body.agent ?? "designer-agent";

      if (handoff.status === "pending" && body.claimIfPending !== false) {
        handoff = await store.claim(handoff.id, {
          agent,
          note: body.claimNote ?? "designer started deliverable update"
        });
      }

      const artifacts = normalizeDeliverableInputs(body);
      if (artifacts.length === 0) {
        throw new StoreError(400, "deliverables request must include artifact data.");
      }

      for (const artifact of artifacts) {
        handoff = await store.addArtifact(handoff.id, artifact);
      }

      if (typeof body.note === "string" && body.note.trim()) {
        handoff = await store.appendMessage(handoff.id, {
          author: agent,
          body: body.note.trim(),
          kind: "deliverable"
        });
      }

      const context = await buildThreadContextPacket(store, projectionStores, id, {
        agent,
        messageLimit: body.messageLimit,
        handoffLimit: body.handoffLimit,
        includeClosed: body.includeClosed === true || handoff.status === "completed"
      });
      json(response, 200, {
        handoff,
        addedArtifacts: artifacts.length,
        context
      });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "verification") {
      const body = await readJsonBody(request);
      let handoff = await resolvePrimaryThreadHandoff(store, id);
      const agent = body.agent ?? "designer-agent";

      if (handoff.status === "pending" && body.claimIfPending !== false) {
        handoff = await store.claim(handoff.id, {
          agent,
          note: body.claimNote ?? "designer started verification pass"
        });
      }

      const messageBody = buildVerificationMessage(body);
      if (body.status === "blocked" && body.autoBlock !== false) {
        handoff = await store.block(handoff.id, {
          agent,
          reason: body.blockReason ?? messageBody
        });
      } else {
        handoff = await store.appendMessage(handoff.id, {
          author: agent,
          body: messageBody,
          kind: body.kind ?? "verification"
        });

        if (
          body.completeIfReady === true
          && ["ready-for-review", "ready-for-handoff", "approved", "complete"].includes(String(body.status || "").trim())
        ) {
          handoff = await store.complete(handoff.id, {
            agent,
            result: body.result ?? messageBody
          });
        }
      }

      const context = await buildThreadContextPacket(store, projectionStores, id, {
        agent,
        messageLimit: body.messageLimit,
        handoffLimit: body.handoffLimit,
        includeClosed: body.includeClosed === true || handoff.status === "completed"
      });
      json(response, 200, {
        handoff,
        verification: {
          status: body.status ?? null,
          summary: messageBody
        },
        context
      });
      return true;
    }

    return false;
  };
}
