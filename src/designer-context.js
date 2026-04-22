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

function normalizeBrief(entry = {}) {
  const brief = normalizeFigmaBriefEntry(entry);

  return {
    ...brief,
    summary: brief.objective,
    deliverables: brief.deliverables.slice(0, 3)
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

function buildNextActions({ focusThread, handoffs, briefs }) {
  const nextActions = [];
  const blockedHandoff = handoffs.find((item) => item.status === "blocked");
  const pendingHandoff = handoffs.find((item) => item.status === "pending");
  const claimedHandoff = handoffs.find((item) => item.status === "claimed");

  if (focusThread?.unread) {
    nextActions.push({
      type: "review-unread-thread",
      priority: "high",
      threadId: focusThread.id,
      handoffId: focusThread.latestHandoffId ?? null,
      title: focusThread.title,
      reason: "읽지 않은 피드백이나 후속 지시가 있어 먼저 확인하는 편이 좋습니다."
    });
  }

  if (blockedHandoff) {
    nextActions.push({
      type: "resolve-blocked-handoff",
      priority: "high",
      handoffId: blockedHandoff.id,
      threadId: blockedHandoff.threadId ?? null,
      title: blockedHandoff.title,
      reason: "막힌 디자인 작업이 있어 해결 전에는 다음 실행 루프가 비효율적입니다."
    });
  }

  if (pendingHandoff) {
    nextActions.push({
      type: "start-pending-handoff",
      priority: "medium",
      handoffId: pendingHandoff.id,
      threadId: pendingHandoff.threadId ?? null,
      title: pendingHandoff.title,
      reason: "아직 시작되지 않은 디자인 작업이 큐에 있습니다."
    });
  } else if (claimedHandoff) {
    nextActions.push({
      type: "continue-claimed-handoff",
      priority: "medium",
      handoffId: claimedHandoff.id,
      threadId: claimedHandoff.threadId ?? null,
      title: claimedHandoff.title,
      reason: "이미 잡고 있는 디자인 작업의 다음 응답 또는 산출물을 이어가면 됩니다."
    });
  }

  if (briefs.length === 0 && handoffs.length > 0) {
    nextActions.push({
      type: "backfill-figma-brief",
      priority: "medium",
      reason: "최근 figma projection brief가 없어 디자인 컨텍스트가 얕을 수 있습니다."
    });
  } else if (briefs[0]) {
    nextActions.push({
      type: "review-latest-brief",
      priority: "low",
      briefId: briefs[0].id,
      title: briefs[0].title,
      reason: "최근 brief를 다시 보면 현재 디자인 결정을 더 빨리 이어갈 수 있습니다."
    });
  }

  return nextActions.slice(0, 5);
}

function buildBlockers(handoffs = []) {
  return handoffs
    .filter((handoff) => handoff.status === "blocked")
    .map((handoff) => ({
      handoffId: handoff.id,
      threadId: handoff.threadId ?? null,
      title: handoff.title,
      reason: Array.isArray(handoff.messages) && handoff.messages.length > 0
        ? handoff.messages[handoff.messages.length - 1].body ?? "blocked"
        : "blocked"
    }));
}

function buildDeliverables(brief = null, handoff = null) {
  if (brief?.deliverables && brief.deliverables.length > 0) {
    return brief.deliverables;
  }

  return (Array.isArray(handoff?.artifacts) ? handoff.artifacts : [])
    .filter((item) => ["figma", "image", "thumbnail"].includes(String(item?.type || "").trim()))
    .map((item) => ({
      type: item.type ?? null,
      path: item.path ?? null,
      label: item.label ?? item.type ?? null
    }));
}

function buildNextVerification({ focusIntent, focusAssessment }) {
  const items = [];

  if (!focusIntent) {
    return items;
  }

  if (!focusIntent.fileKey && !focusIntent.nodeId) {
    items.push({
      type: "confirm-target",
      priority: "high",
      detail: "fileKey 또는 nodeId가 없어 작업 대상을 먼저 확정해야 합니다."
    });
  }

  for (const criterion of focusAssessment?.missing ?? []) {
    items.push({
      type: "verify-criterion",
      priority: "medium",
      detail: criterion
    });
  }

  if (focusAssessment && !focusAssessment.hasDeliverable) {
    items.push({
      type: "attach-deliverable",
      priority: "medium",
      detail: "작업 결과 산출물을 아직 찾지 못했습니다."
    });
  }

  return items.slice(0, 5);
}

function getQueueScore({ thread, handoff, brief, assessment, blockers }) {
  let score = 0;

  if (thread?.unread) {
    score += 40;
  }

  if (blockers.length > 0 || assessment?.status === "blocked") {
    score += 45;
  } else if (assessment?.status === "needs-design-pass") {
    score += 34;
  } else if (assessment?.status === "needs-verification") {
    score += 22;
  } else if (assessment?.status === "needs-review") {
    score += 16;
  } else if (assessment?.status === "ready-for-review") {
    score += 8;
  }

  if (handoff?.status === "pending") {
    score += 12;
  } else if (handoff?.status === "claimed") {
    score += 9;
  }

  if (!brief) {
    score += 6;
  }

  if (!assessment?.hasDeliverable) {
    score += 12;
  }

  return score;
}

function buildQueueReason({ thread, handoff, assessment, blockers }) {
  if (thread?.unread) {
    return "읽지 않은 피드백이 있어 먼저 확인이 필요합니다.";
  }

  if (blockers.length > 0 || assessment?.status === "blocked") {
    return "막힌 작업이 있어 우선 해결해야 다음 디자인 루프가 정상 진행됩니다.";
  }

  if (assessment?.status === "needs-design-pass") {
    return "산출물이 아직 없어 실제 디자인 수정과 결과 첨부가 먼저 필요합니다.";
  }

  if (assessment?.status === "needs-verification") {
    return "산출물은 있지만 acceptance criteria 검증이 아직 덜 끝났습니다.";
  }

  if (handoff?.status === "pending") {
    return "아직 시작되지 않은 작업입니다.";
  }

  if (handoff?.status === "claimed") {
    return "진행 중인 작업으로 다음 응답 또는 수정이 필요합니다.";
  }

  return "최근 작업 흐름을 유지하면 됩니다.";
}

function pickQueueNextStep({ thread, assessment, blockers }) {
  if (thread?.unread) {
    return "review-feedback";
  }

  if (blockers.length > 0 || assessment?.status === "blocked") {
    return "resolve-blocker";
  }

  if (!assessment?.hasDeliverable) {
    return "attach-deliverable";
  }

  if ((assessment?.missing ?? []).length > 0) {
    return "verify-criteria";
  }

  return "handoff-review";
}

function buildWorkQueue(threads = [], briefs = [], handoffs = []) {
  const queue = threads.map((thread) => {
    const threadHandoffs = handoffs.filter((item) => item.threadId === thread.id || item.id === thread.latestHandoffId);
    const handoff = pickActiveHandoff(threadHandoffs);
    const brief = briefs.find((item) => item.threadId === thread.id || item.id === handoff?.id || item.id === thread.latestHandoffId) ?? null;
    const objective = brief?.objective ?? handoff?.payload?.summary ?? thread.title;
    const designIntent = handoff
      ? normalizeFigmaIntent(handoff.payload ?? {}, handoff.artifacts ?? [], {
          title: handoff.title,
          summary: handoff.payload?.summary ?? handoff.title
        })
      : null;
    const blockers = buildBlockers(threadHandoffs);
    const deliverables = buildDeliverables(brief, handoff);
    const executionPlan = buildExecutionPlan({
      designIntent,
      blockers,
      deliverables
    });
    const assessment = buildCompletionAssessment({
      designIntent,
      blockers,
      deliverables,
      messageBodies: Array.isArray(handoff?.messages) ? handoff.messages.map((message) => message?.body ?? null) : [],
      decisionBodies: [],
      referenceTexts: []
        .concat(brief?.objective ?? [])
        .concat(brief?.constraints ?? [])
    });
    const queueScore = getQueueScore({
      thread,
      handoff,
      brief,
      assessment,
      blockers
    });

    return {
      threadId: thread.id,
      handoffId: handoff?.id ?? thread.latestHandoffId ?? null,
      title: thread.title,
      unread: thread.unread ?? null,
      status: handoff?.status ?? thread.latestHandoffStatus ?? null,
      objective,
      hasBrief: Boolean(brief),
      hasDeliverable: assessment.hasDeliverable,
      deliverableCount: assessment.deliverableCount,
      assessmentStatus: assessment.status,
      executionStage: executionPlan.stage,
      missingCriteriaCount: assessment.missing.length,
      nextStep: pickQueueNextStep({ thread, assessment, blockers }),
      queueScore,
      queueReason: buildQueueReason({ thread, handoff, assessment, blockers }),
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

function hasActionableDesignerActivity(threadSummary = {}) {
  if (threadSummary.latestHandoffId) {
    return true;
  }

  return threadSummary.unread === true;
}

export async function buildDesignerContext(store, projectionStore, input = {}) {
  const channel = String(input.channel || "figma").trim() || "figma";
  const agent = typeof input.agent === "string" && input.agent.trim() ? input.agent.trim() : null;
  const includeClosed = input.includeClosed === true;
  const limit = parseLimit(input.limit, 5);
  const handoffLimit = parseLimit(input.handoffLimit, 5);
  const briefLimit = parseLimit(input.briefLimit, 5);
  const threadFilters = {};
  const handoffFilters = {
    channel,
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
      : Promise.resolve({ channel, updatedAt: null, entries: [] })
  ]);

  const activeStatuses = includeClosed ? undefined : ["pending", "claimed", "blocked"];
  const readStateByThread = normalizeReadStateByThread(readStates);
  const rawThreadSummaries = buildThreadInbox(threads, handoffs, {
    agent: agent ?? undefined,
    channel,
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
  const actionableThreadSummaries = threadSummaries.filter(hasActionableDesignerActivity);
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
    .map(normalizeBrief);
  const workQueue = buildWorkQueue(actionableThreadSummaries, briefs, rawHandoffs);
  const focusThread = (workQueue[0]?.threadId
    ? actionableThreadSummaries.find((thread) => thread.id === workQueue[0].threadId)
    : null) ?? actionableThreadSummaries[0] ?? null;
  const focusHandoff = pickActiveHandoff(rawHandoffs.filter((handoff) => handoff.threadId === focusThread?.id));
  const nextActions = buildNextActions({
    focusThread,
    handoffs: filteredHandoffs,
    briefs
  });
  const focusBrief = pickFocusBrief(briefs, focusThread);
  const focusIntent = focusHandoff
    ? normalizeFigmaIntent(focusHandoff.payload ?? {}, focusHandoff.artifacts ?? [], {
        title: focusHandoff.title,
        summary: focusHandoff.payload?.summary ?? focusHandoff.title
      })
    : null;
  const focusBlockers = buildBlockers(rawHandoffs.filter((handoff) => handoff.threadId === focusThread?.id));
  const focusDeliverables = buildDeliverables(focusBrief, focusHandoff);
  const focusExecutionPlan = buildExecutionPlan({
    designIntent: focusIntent,
    blockers: focusBlockers,
    deliverables: focusDeliverables
  });
  const focusAssessment = buildCompletionAssessment({
    designIntent: focusIntent,
    blockers: focusBlockers,
    deliverables: focusDeliverables,
    messageBodies: Array.isArray(focusHandoff?.messages) ? focusHandoff.messages.map((message) => message?.body ?? null) : [],
    decisionBodies: [],
    referenceTexts: []
      .concat(focusBrief?.objective ?? [])
      .concat(focusBrief?.constraints ?? [])
  });
  const nextVerification = buildNextVerification({
    focusIntent,
    focusAssessment
  });

  return {
    agent,
    channel,
    generatedAt: new Date().toISOString(),
    summary: {
      focusMode: nextActions[0]?.type ?? "idle",
      threadCount: actionableThreadSummaries.length,
      unreadThreads: agent ? actionableThreadSummaries.filter((item) => item.unread).length : 0,
      pendingHandoffs: filteredHandoffs.filter((item) => item.status === "pending").length,
      claimedHandoffs: filteredHandoffs.filter((item) => item.status === "claimed").length,
      blockedHandoffs: filteredHandoffs.filter((item) => item.status === "blocked").length,
      briefCount: briefs.length,
      hasFigmaBrief: briefs.length > 0,
      focusObjective: focusIntent?.designGoal ?? focusBrief?.objective ?? null,
      focusExecutionStage: focusExecutionPlan.stage,
      focusAssessmentStatus: focusAssessment.status
    },
    readState: readState ?? null,
    focusThread,
    focusIntent,
    focusBrief,
    focusExecutionPlan,
    focusAssessment,
    nextActions,
    nextVerification,
    workQueue,
    threads: actionableThreadSummaries,
    handoffs: filteredHandoffs,
    briefs,
    projectionStore: {
      channel: briefSnapshot?.channel ?? channel,
      updatedAt: briefSnapshot?.updatedAt ?? null,
      entryCount: Array.isArray(briefSnapshot?.entries) ? briefSnapshot.entries.length : 0
    }
  };
}
