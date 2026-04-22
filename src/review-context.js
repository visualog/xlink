import { buildThreadInbox, getHandoffLastActivityAt, toInboxItem } from "./mailbox.js";

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

function normalizeReviewBrief(entry = {}) {
  const data = entry?.data ?? entry;
  const payload = data?.payload ?? {};

  return {
    id: data?.id ?? entry?.id ?? null,
    threadId: data?.threadId ?? null,
    channel: entry?.channel ?? data?.channel ?? "review",
    kind: entry?.kind ?? "review-brief",
    title: data?.title ?? payload.title ?? null,
    status: data?.status ?? null,
    priority: data?.priority ?? null,
    sourceAgent: data?.sourceAgent ?? null,
    targetAgent: data?.targetAgent ?? null,
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? data?.createdAt ?? null,
    objective: payload.summary ?? payload.title ?? data?.title ?? null,
    checklist: Array.isArray(data?.checklist) ? data.checklist : [],
    files: Array.isArray(payload.files) ? payload.files : [],
    links: Array.isArray(payload.links) ? payload.links : [],
    artifacts: Array.isArray(data?.artifacts) ? data.artifacts : []
  };
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

function pickFocusBrief(briefs = [], focusThread = null) {
  if (!Array.isArray(briefs) || briefs.length === 0) {
    return null;
  }

  if (focusThread?.id) {
    const byThread = briefs.find((brief) => brief.threadId === focusThread.id);
    if (byThread) {
      return byThread;
    }
  }

  if (focusThread?.latestHandoffId) {
    const byHandoff = briefs.find((brief) => brief.id === focusThread.latestHandoffId);
    if (byHandoff) {
      return byHandoff;
    }
  }

  return briefs[0];
}

function buildNextActions({ focusThread, handoffs, focusBrief }) {
  const nextActions = [];
  const blockedHandoff = handoffs.find((item) => item.status === "blocked");
  const pendingHandoff = handoffs.find((item) => item.status === "pending");
  const claimedHandoff = handoffs.find((item) => item.status === "claimed");

  if (blockedHandoff) {
    nextActions.push({
      type: "resolve-blocked-review",
      priority: "high",
      threadId: blockedHandoff.threadId ?? null,
      handoffId: blockedHandoff.id,
      title: blockedHandoff.title,
      reason: "리뷰 단계에서 막힌 작업이 있어 먼저 해소해야 합니다."
    });
  }

  if (focusThread?.unread) {
    nextActions.push({
      type: "review-unread-thread",
      priority: "high",
      threadId: focusThread.id,
      handoffId: focusThread.latestHandoffId ?? null,
      title: focusThread.title,
      reason: "읽지 않은 디자인 결과나 피드백이 있어 먼저 확인하는 편이 좋습니다."
    });
  }

  if (pendingHandoff) {
    nextActions.push({
      type: "claim-pending-review",
      priority: "medium",
      threadId: pendingHandoff.threadId ?? null,
      handoffId: pendingHandoff.id,
      title: pendingHandoff.title,
      reason: "아직 시작되지 않은 리뷰 handoff가 대기 중입니다."
    });
  } else if (claimedHandoff) {
    nextActions.push({
      type: "continue-review",
      priority: "medium",
      threadId: claimedHandoff.threadId ?? null,
      handoffId: claimedHandoff.id,
      title: claimedHandoff.title,
      reason: "진행 중인 리뷰를 이어서 판단하거나 피드백을 남기면 됩니다."
    });
  }

  if (focusBrief?.checklist?.length) {
    nextActions.push({
      type: "run-review-checklist",
      priority: "medium",
      briefId: focusBrief.id,
      title: focusBrief.title,
      reason: `체크리스트 ${focusBrief.checklist.length}개를 따라 리뷰를 정리하면 됩니다.`
    });
  }

  return nextActions.slice(0, 5);
}

function getQueueScore({ thread, handoff, brief }) {
  let score = 0;

  if (thread?.unread) {
    score += 40;
  }

  if (handoff?.status === "blocked") {
    score += 32;
  } else if (handoff?.status === "pending") {
    score += 24;
  } else if (handoff?.status === "claimed") {
    score += 16;
  }

  if (brief?.checklist?.length) {
    score += 4;
  }

  return score;
}

function buildQueueReason({ thread, handoff, brief }) {
  if (thread?.unread) {
    return "새 디자인 결과 또는 피드백이 있어 먼저 확인이 필요합니다.";
  }

  if (handoff?.status === "blocked") {
    return "리뷰 단계가 막혀 있어 우선 해소가 필요합니다.";
  }

  if (handoff?.status === "pending") {
    return "아직 시작되지 않은 리뷰 handoff입니다.";
  }

  if (handoff?.status === "claimed") {
    return "진행 중인 리뷰를 이어서 결론을 내려야 합니다.";
  }

  if (brief?.checklist?.length) {
    return "리뷰 체크리스트를 따라 확인할 수 있습니다.";
  }

  return "최근 리뷰 흐름을 유지하면 됩니다.";
}

function buildWorkQueue(threads = [], briefs = [], handoffs = []) {
  const queue = threads.map((thread) => {
    const threadHandoffs = handoffs.filter((item) => item.threadId === thread.id || item.id === thread.latestHandoffId);
    const handoff = pickActiveHandoff(threadHandoffs);
    const brief = briefs.find((item) => item.threadId === thread.id || item.id === handoff?.id || item.id === thread.latestHandoffId) ?? null;
    const queueScore = getQueueScore({ thread, handoff, brief });

    return {
      threadId: thread.id,
      handoffId: handoff?.id ?? thread.latestHandoffId ?? null,
      title: thread.title,
      unread: thread.unread ?? null,
      status: handoff?.status ?? thread.latestHandoffStatus ?? null,
      objective: brief?.objective ?? handoff?.payload?.summary ?? thread.title,
      checklistCount: brief?.checklist?.length ?? 0,
      artifactCount: Array.isArray(handoff?.artifacts) ? handoff.artifacts.length : 0,
      nextStep: thread.unread ? "review-feedback" : handoff?.status === "pending" ? "claim-review" : "complete-review",
      queueScore,
      queueReason: buildQueueReason({ thread, handoff, brief }),
      updatedAt: thread.updatedAt ?? handoff?.updatedAt ?? null
    };
  });

  return queue
    .sort((a, b) => {
      if (b.queueScore !== a.queueScore) {
        return b.queueScore - a.queueScore;
      }

      return toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
    })
    .slice(0, 5);
}

export async function buildReviewContext(store, projectionStore, input = {}) {
  const agent = typeof input.agent === "string" && input.agent.trim() ? input.agent.trim() : null;
  const includeClosed = input.includeClosed === true;
  const limit = parseLimit(input.limit, 5);
  const handoffLimit = parseLimit(input.handoffLimit, 5);
  const briefLimit = parseLimit(input.briefLimit, 5);
  const threadFilters = {};
  const handoffFilters = {
    channel: "review",
    targetAgent: agent ?? undefined
  };

  const [threads, handoffs, readState, readStates, briefSnapshot] = await Promise.all([
    store.listThreads(threadFilters),
    store.list(handoffFilters),
    agent ? store.getMailboxReadState(agent) : Promise.resolve(null),
    agent && typeof store.listMailboxReadStates === "function"
      ? store.listMailboxReadStates(agent)
      : Promise.resolve([]),
    projectionStore && typeof projectionStore.listEntries === "function"
      ? projectionStore.listEntries()
      : Promise.resolve({ channel: "review", updatedAt: null, entries: [] })
  ]);

  const activeStatuses = includeClosed ? undefined : ["pending", "claimed", "blocked"];
  const readStateByThread = normalizeReadStateByThread(readStates);
  const rawThreadSummaries = buildThreadInbox(threads, handoffs, {
    agent: agent ?? undefined,
    channel: "review",
    status: activeStatuses,
    lastReadAt: readState?.globalLastReadAt ?? readState?.lastReadAt ?? null,
    readStateByThread,
    limit
  });
  const threadSummaries = agent
    ? rawThreadSummaries
    : rawThreadSummaries.map((item) => ({
        ...item,
        unread: null,
        lastReadAt: null
      }));
  const rawHandoffs = handoffs
    .filter((handoff) => !activeStatuses || activeStatuses.includes(handoff.status))
    .sort((a, b) => toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a)));
  const filteredHandoffs = rawHandoffs
    .slice(0, handoffLimit)
    .map((handoff) =>
      toInboxItem(handoff, {
        includeUnread: Boolean(agent),
        resolveLastReadAt: (threadId) => {
          const scoped = threadId ? readStateByThread[threadId] : null;
          const globalLastReadAt = readState?.globalLastReadAt ?? readState?.lastReadAt ?? null;
          return toTimestamp(scoped) > toTimestamp(globalLastReadAt) ? scoped : globalLastReadAt;
        }
      })
    );
  const briefs = (Array.isArray(briefSnapshot?.entries) ? briefSnapshot.entries : [])
    .slice(0, briefLimit)
    .map(normalizeReviewBrief);
  const workQueue = buildWorkQueue(threadSummaries, briefs, rawHandoffs);
  const focusThread = (workQueue[0]?.threadId
    ? threadSummaries.find((thread) => thread.id === workQueue[0].threadId)
    : null) ?? threadSummaries[0] ?? null;
  const focusHandoff = pickActiveHandoff(rawHandoffs.filter((handoff) => handoff.threadId === focusThread?.id));
  const focusBrief = pickFocusBrief(briefs, focusThread);
  const nextActions = buildNextActions({
    focusThread,
    handoffs: filteredHandoffs,
    focusBrief
  });

  return {
    agent,
    channel: "review",
    generatedAt: new Date().toISOString(),
    summary: {
      focusMode: nextActions[0]?.type ?? "idle",
      threadCount: threadSummaries.length,
      unreadThreads: agent ? threadSummaries.filter((item) => item.unread).length : 0,
      pendingHandoffs: filteredHandoffs.filter((item) => item.status === "pending").length,
      claimedHandoffs: filteredHandoffs.filter((item) => item.status === "claimed").length,
      blockedHandoffs: filteredHandoffs.filter((item) => item.status === "blocked").length,
      briefCount: briefs.length,
      focusChecklistCount: focusBrief?.checklist?.length ?? 0
    },
    readState: readState ?? null,
    focusThread,
    focusHandoff: focusHandoff ? toInboxItem(focusHandoff) : null,
    focusBrief,
    focusChecklist: focusBrief?.checklist ?? [],
    nextActions,
    workQueue,
    threads: threadSummaries,
    handoffs: filteredHandoffs,
    briefs,
    projectionStore: {
      channel: briefSnapshot?.channel ?? "review",
      updatedAt: briefSnapshot?.updatedAt ?? null,
      entryCount: Array.isArray(briefSnapshot?.entries) ? briefSnapshot.entries.length : 0
    }
  };
}
