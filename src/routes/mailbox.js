import { json, readJsonBody } from "../http.js";
import { buildMailboxSnapshot } from "../mailbox.js";
import { parseStreamInterval, startSse, writeSse } from "../sse.js";

function getStatusParams(searchParams) {
  const statuses = searchParams.getAll("status");
  const status = statuses.length === 1 ? statuses[0] : undefined;
  return { status, statuses };
}

function getMailboxFilters(searchParams, after) {
  const { status } = getStatusParams(searchParams);

  return {
    status,
    threadId: searchParams.get("threadId") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
    targetAgent: searchParams.get("targetAgent") ?? undefined,
    sourceAgent: searchParams.get("sourceAgent") ?? undefined,
    updatedSince: after
  };
}

function getThreadFilters(searchParams, after) {
  return {
    threadId: searchParams.get("threadId") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    targetAgent: searchParams.get("targetAgent") ?? undefined,
    sourceAgent: searchParams.get("sourceAgent") ?? undefined,
    updatedSince: after
  };
}

function getMailboxSnapshotInput(searchParams, after) {
  const { status, statuses } = getStatusParams(searchParams);

  return {
    agent: searchParams.get("agent") ?? undefined,
    threadId: searchParams.get("threadId") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    targetAgent: searchParams.get("targetAgent") ?? undefined,
    sourceAgent: searchParams.get("sourceAgent") ?? undefined,
    status,
    statuses,
    after,
    includeClosed: searchParams.get("includeClosed") === "true"
  };
}

function getMailboxPathAgent(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "mailbox" && parts[2] === "unread-count") {
    return parts[1];
  }
  if (parts.length === 3 && parts[0] === "mailbox" && parts[2] === "ack") {
    return parts[1];
  }

  return null;
}

async function buildSnapshotForAgent(store, searchParams, after, agentOverride) {
  const handoffFilters = getMailboxFilters(searchParams, after);
  const threadFilters = getThreadFilters(searchParams, after);
  const agent = agentOverride ?? searchParams.get("agent") ?? undefined;
  const [handoffs, threads, readState, readStates] = await Promise.all([
    store.list(handoffFilters),
    store.listThreads(threadFilters),
    agent ? store.getMailboxReadState(agent, { threadId: searchParams.get("threadId") ?? undefined }) : Promise.resolve(null),
    agent && typeof store.listMailboxReadStates === "function" ? store.listMailboxReadStates(agent) : Promise.resolve([])
  ]);
  const readStateByThread = Object.fromEntries(
    (readStates ?? [])
      .filter((item) => item?.threadId)
      .map((item) => [item.threadId, item.lastReadAt ?? null])
  );

  return buildMailboxSnapshot({ handoffs, threads }, {
    ...getMailboxSnapshotInput(searchParams, after),
    agent,
    lastReadAt: readState?.globalLastReadAt ?? readState?.lastReadAt ?? null,
    readStateByThread
  });
}

export function createMailboxRoutes(store) {
  return async function handleMailboxRoute(request, response, url) {
    const pathAgent = getMailboxPathAgent(url);

    if (request.method === "GET" && pathAgent && url.pathname.endsWith("/unread-count")) {
      const snapshot = await buildSnapshotForAgent(store, url.searchParams, undefined, pathAgent);
      json(response, 200, {
        ok: true,
        agent: pathAgent,
        unreadCount: snapshot.mailbox.unreadCount ?? 0,
        lastReadAt: snapshot.mailbox.lastReadAt,
        cursor: snapshot.mailbox.cursor,
        threadId: snapshot.mailbox.threadId,
        threadIds: snapshot.threads.filter((item) => item.unread).map((item) => item.id),
        handoffIds: Array.from(
          new Set(
            snapshot.threads
              .filter((item) => item.unread)
              .flatMap((item) => (Array.isArray(item.handoffIds) ? item.handoffIds : []))
          )
        )
      });
      return true;
    }

    if (request.method === "POST" && pathAgent && url.pathname.endsWith("/ack")) {
      const body = await readJsonBody(request);
      const ack = await store.ackMailbox(pathAgent, body);
      const snapshot = await buildSnapshotForAgent(store, url.searchParams, undefined, pathAgent);

      json(response, 200, {
        ok: true,
        ack,
        unreadCount: snapshot.mailbox.unreadCount ?? 0,
        threadId: ack.threadId ?? null
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/mailbox") {
      const after = url.searchParams.get("after") ?? undefined;
      const result = await buildSnapshotForAgent(store, url.searchParams, after);
      json(response, 200, { ok: true, ...result });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/mailbox/stream") {
      let cursor = url.searchParams.get("after") ?? undefined;
      const intervalMs = parseStreamInterval(url.searchParams.get("interval"), 2000);
      startSse(response);
      writeSse(response, "ready", {
        stream: "mailbox",
        intervalMs,
        cursor: cursor ?? null
      });

      let inFlight = false;
      const publish = async () => {
        if (inFlight) {
          return;
        }
        inFlight = true;
        try {
          const snapshot = await buildSnapshotForAgent(store, url.searchParams, cursor);

          if (snapshot.threads.length > 0 || snapshot.handoffs.length > 0) {
            writeSse(response, "mailbox", { ok: true, ...snapshot });
            cursor = snapshot.mailbox.nextAfter ?? cursor;
          } else {
            writeSse(response, "heartbeat", {
              stream: "mailbox",
              cursor: cursor ?? null,
              now: new Date().toISOString()
            });
          }
        } finally {
          inFlight = false;
        }
      };

      await publish();
      const timer = setInterval(() => {
        publish().catch((error) => {
          writeSse(response, "error", { message: error.message });
        });
      }, intervalMs);

      request.on("close", () => {
        clearInterval(timer);
        if (!response.writableEnded) {
          response.end();
        }
      });

      return true;
    }

    return false;
  };
}
