import { buildThreadInbox, getHandoffLastActivityAt, toInboxItem } from "./mailbox.js";
import { normalizeFigmaIntent } from "./figma-intent.js";
import { normalizeFigmaBriefEntry } from "./projections.js";
import { buildCompletionAssessment, buildExecutionPlan } from "./design-execution.js";

function toTimestamp(value) {
  const parsed = Date.parse(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseLimit(value, fallback, maximum = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
}

function normalizeReadStateByThread(readStates = []) {
  return Object.fromEntries(
    readStates
      .filter((item) => item?.threadId)
      .map((item) => [item.threadId, item.lastReadAt ?? null])
  );
}

function pickActiveHandoff(handoffs = []) {
  const priority = ["claimed", "pending", "blocked", "rejected", "completed"];

  for (const status of priority) {
    const found = handoffs.find((item) => item.status === status);
    if (found) {
      return found;
    }
  }

  return handoffs[0] ?? null;
}

function normalizeProjectionEntry(channel, entry = {}) {
  if (channel === "figma") {
    return normalizeFigmaBriefEntry({
      ...entry,
      channel
    });
  }

  const data = entry?.data ?? {};
  const payload = data?.payload ?? {};
  return {
    id: entry.id ?? data.id ?? null,
    channel,
    kind: entry.kind ?? null,
    title: data.title ?? payload.title ?? null,
    summary: payload.summary ?? data.title ?? null,
    updatedAt: data.updatedAt ?? data.createdAt ?? null,
    data: entry.data ?? null
  };
}

function buildDecisionLog(messages = []) {
  return messages
    .filter((message) => {
      const kind = String(message?.kind || "").trim().toLowerCase();
      if (["decision", "result", "reply", "blocked", "rejected"].includes(kind)) {
        return true;
      }

      const body = String(message?.body || "").toLowerCase();
      return body.includes("결정") || body.includes("approved") || body.includes("ship") || body.includes("완료");
    })
    .map((message) => ({
      author: message.author ?? null,
      body: message.body ?? null,
      kind: message.kind ?? "note",
      createdAt: message.createdAt ?? null
    }));
}

function buildOpenQuestions(messages = []) {
  return messages
    .filter((message) => {
      const kind = String(message?.kind || "").trim().toLowerCase();
      const body = String(message?.body || "").trim();
      return kind === "question" || body.endsWith("?") || body.endsWith("？");
    })
    .map((message) => ({
      author: message.author ?? null,
      body: message.body ?? null,
      createdAt: message.createdAt ?? null
    }));
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function uniqueMessages(messages = []) {
  const seen = new Set();
  const result = [];

  for (const message of messages) {
    const key = [
      message?.author ?? "",
      message?.kind ?? "",
      message?.createdAt ?? "",
      message?.body ?? ""
    ].join("::");

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(message);
  }

  return result;
}

function flattenArtifacts(handoffs = []) {
  const seen = new Set();
  const result = [];

  for (const handoff of handoffs) {
    for (const artifact of Array.isArray(handoff.artifacts) ? handoff.artifacts : []) {
      const key = `${artifact.type}:${artifact.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        handoffId: handoff.id,
        type: artifact.type ?? null,
        path: artifact.path ?? null,
        label: artifact.label ?? artifact.type ?? null
      });
    }
  }

  return result;
}

function buildBlockers(handoffs = []) {
  return handoffs
    .filter((handoff) => handoff.status === "blocked")
    .map((handoff) => {
      const lastMessage = Array.isArray(handoff.messages) && handoff.messages.length > 0
        ? handoff.messages[handoff.messages.length - 1]
        : null;
      return {
        handoffId: handoff.id,
        title: handoff.title,
        reason: lastMessage?.body ?? "blocked",
        updatedAt: getHandoffLastActivityAt(handoff)
      };
    });
}

export async function buildThreadContextPacket(store, projectionStores = new Map(), threadId, input = {}) {
  const agent = typeof input.agent === "string" && input.agent.trim() ? input.agent.trim() : null;
  const includeClosed = input.includeClosed === true;
  const messageLimit = parseLimit(input.messageLimit, 6);
  const handoffLimit = parseLimit(input.handoffLimit, 5);
  const thread = await store.getThreadById(threadId);
  const [handoffs, readState, readStates] = await Promise.all([
    store.list({ threadId }),
    agent ? store.getMailboxReadState(agent, { threadId }) : Promise.resolve(null),
    agent && typeof store.listMailboxReadStates === "function"
      ? store.listMailboxReadStates(agent)
      : Promise.resolve([])
  ]);

  const readStateByThread = normalizeReadStateByThread(readStates);
  const summaries = buildThreadInbox([thread], handoffs, {
    agent: agent ?? undefined,
    threadId,
    channel: thread.channel,
    lastReadAt: readState?.globalLastReadAt ?? readState?.lastReadAt ?? null,
    readStateByThread,
    limit: 1
  });
  const summary = summaries[0] ?? null;
  const visibleHandoffs = includeClosed
    ? handoffs
    : handoffs.filter((handoff) => ["pending", "claimed", "blocked"].includes(handoff.status));
  const sortedHandoffs = visibleHandoffs
    .slice()
    .sort((a, b) => toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a)));
  const activeHandoff = pickActiveHandoff(sortedHandoffs);
  const globalMessages = uniqueMessages(
    []
    .concat(Array.isArray(thread.messages) ? thread.messages : [])
    .concat(sortedHandoffs.flatMap((handoff) => Array.isArray(handoff.messages) ? handoff.messages : []))
    .sort((a, b) => toTimestamp(a?.createdAt) - toTimestamp(b?.createdAt))
  );
  const recentMessages = globalMessages.slice(-messageLimit);
  const recentHandoffs = sortedHandoffs.slice(0, handoffLimit).map((handoff) => toInboxItem(handoff, {
    includeUnread: Boolean(agent),
    resolveLastReadAt: () => readState?.lastReadAt ?? readState?.globalLastReadAt ?? null
  }));
  const projectionSnapshots = await Promise.all(
    Array.from(projectionStores.entries()).map(async ([channel, projectionStore]) => {
      if (!projectionStore || typeof projectionStore.listEntries !== "function") {
        return [channel, []];
      }

      const snapshot = await projectionStore.listEntries({
        ids: [threadId, ...handoffs.map((handoff) => handoff.id)]
      });
      const entries = Array.isArray(snapshot?.entries) ? snapshot.entries.map((entry) => normalizeProjectionEntry(channel, entry)) : [];
      return [channel, entries];
    })
  );
  const channelEntries = Object.fromEntries(projectionSnapshots);
  const channelCoverage = uniqueStrings(
    [thread.channel]
      .concat(
        Object.entries(channelEntries)
          .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
          .map(([channel]) => channel)
      )
  );
  const artifacts = flattenArtifacts(sortedHandoffs);
  const files = uniqueStrings(sortedHandoffs.flatMap((handoff) => handoff.payload?.files ?? []));
  const links = uniqueStrings(sortedHandoffs.flatMap((handoff) => handoff.payload?.links ?? []));
  const requestedOutput = uniqueStrings(
    []
      .concat(activeHandoff?.payload?.type ? [activeHandoff.payload.type] : [])
      .concat(activeHandoff?.payload?.tags ?? [])
  );
  const constraints = uniqueStrings(activeHandoff?.payload?.details ?? []).slice(0, 5);
  const openQuestionSource = Array.isArray(activeHandoff?.messages) && activeHandoff.messages.length > 0
    ? activeHandoff.messages
    : globalMessages;
  const openQuestions = buildOpenQuestions(openQuestionSource).slice(-5);
  const blockers = buildBlockers(sortedHandoffs);
  const decisionLog = buildDecisionLog(globalMessages).slice(-6);
  const lastDecisionAt = decisionLog.length > 0 ? decisionLog[decisionLog.length - 1].createdAt ?? null : null;
  const artifactTypes = uniqueStrings(artifacts.map((artifact) => artifact.type));
  const designIntent = normalizeFigmaIntent(activeHandoff?.payload ?? {}, activeHandoff?.artifacts ?? [], {
    title: activeHandoff?.title ?? thread.title,
    summary: activeHandoff?.payload?.summary ?? activeHandoff?.title ?? thread.title
  });
  const figmaBriefs = Array.isArray(channelEntries.figma) ? channelEntries.figma : [];
  const taskFigmaBrief = figmaBriefs.find((entry) => entry.threadId === thread.id || entry.id === activeHandoff?.id) ?? figmaBriefs[0] ?? null;
  const figmaDeliverables = (taskFigmaBrief?.deliverables && taskFigmaBrief.deliverables.length > 0)
    ? taskFigmaBrief.deliverables
    : artifacts.filter((item) => ["figma", "image", "thumbnail"].includes(item.type));
  const executionPlan = buildExecutionPlan({
    designIntent,
    blockers,
    deliverables: figmaDeliverables
  });
  const assessment = buildCompletionAssessment({
    designIntent,
    blockers,
    deliverables: figmaDeliverables,
    messageBodies: globalMessages.map((message) => message?.body ?? null),
    decisionBodies: decisionLog.map((entry) => entry?.body ?? null),
    referenceTexts: []
      .concat(taskFigmaBrief?.objective ?? [])
      .concat(taskFigmaBrief?.constraints ?? [])
  });

  return {
    thread: summary
      ? {
          ...thread,
          unread: agent ? summary.unread : null,
          lastReadAt: agent ? summary.lastReadAt ?? null : null,
          latestHandoffId: summary.latestHandoffId ?? null,
          latestHandoffStatus: summary.latestHandoffStatus ?? null,
          latestHandoff: summary.latestHandoff ?? null,
          lastMessage: summary.lastMessage ?? null
        }
      : thread,
    summary: {
      unread: agent ? summary?.unread ?? false : null,
      activeHandoffId: activeHandoff?.id ?? null,
      activeStatus: activeHandoff?.status ?? null,
      channelCoverage,
      artifactTypes,
      lastDecisionAt,
      hasFigmaBrief: figmaBriefs.length > 0,
      latestFigmaBriefAt: figmaBriefs[0]?.updatedAt ?? null,
      executionStage: executionPlan.stage,
      assessmentStatus: assessment.status
    },
    task: {
      objective: designIntent.designGoal,
      requestedOutput,
      constraints,
      acceptanceCriteria: designIntent.acceptanceCriteria,
      designIntent,
      figmaBrief: taskFigmaBrief,
      executionPlan,
      blockers,
      openQuestions
    },
    context: {
      latestHandoff: activeHandoff ? toInboxItem(activeHandoff) : null,
      recentMessages,
      recentHandoffs,
      decisionLog
    },
    assets: {
      artifacts,
      files,
      links,
      channelEntries,
      figmaDeliverables
    },
    figma: designIntent,
    assessment,
    readState: readState ?? null
  };
}
