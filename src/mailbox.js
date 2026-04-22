function normalizeStatusFilter(value) {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoOrNull(value) {
  const timestamp = toTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function getNextCursor(after, timestamps = []) {
  const nextTimestamp = Math.max(toTimestamp(after), ...timestamps.map((value) => toTimestamp(value)), 0);
  return nextTimestamp ? new Date(nextTimestamp).toISOString() : null;
}

function filterAfterCursor(items, after, getTimestamp) {
  const threshold = toTimestamp(after);
  if (!threshold) {
    return items;
  }

  return items.filter((item) => toTimestamp(getTimestamp(item)) > threshold);
}

function isUnreadHandoff(handoff = {}, lastReadAt) {
  const cursor = toTimestamp(lastReadAt);
  if (!cursor) {
    return true;
  }

  return toTimestamp(getHandoffLastActivityAt(handoff)) > cursor;
}

function isUnreadActivity(updatedAt, lastReadAt) {
  const cursor = toTimestamp(lastReadAt);
  if (!cursor) {
    return true;
  }

  return toTimestamp(updatedAt) > cursor;
}

function getReadStateMap(input = {}) {
  return input?.readStateByThread && typeof input.readStateByThread === "object" ? input.readStateByThread : {};
}

function resolveLastReadAt(input = {}, threadId = null) {
  const globalLastReadAt = toIsoOrNull(input.lastReadAt);
  if (!threadId) {
    return globalLastReadAt;
  }

  const scoped = toIsoOrNull(getReadStateMap(input)[threadId]);
  if (!scoped) {
    return globalLastReadAt;
  }

  return toTimestamp(scoped) > toTimestamp(globalLastReadAt) ? scoped : globalLastReadAt;
}

export function getHandoffLastActivityAt(handoff = {}) {
  const timestamps = [
    toTimestamp(handoff.updatedAt),
    toTimestamp(handoff.createdAt),
    toTimestamp(handoff.claimedAt),
    toTimestamp(handoff.completedAt)
  ];

  for (const artifact of Array.isArray(handoff.artifacts) ? handoff.artifacts : []) {
    timestamps.push(toTimestamp(artifact.createdAt));
  }

  for (const message of Array.isArray(handoff.messages) ? handoff.messages : []) {
    timestamps.push(toTimestamp(message.createdAt));
  }

  const last = Math.max(...timestamps, 0);
  return last ? new Date(last).toISOString() : null;
}

export function summarizeConversation(handoff = {}) {
  const messages = Array.isArray(handoff.messages) ? handoff.messages : [];
  const participants = Array.from(
    new Set(
      messages
        .map((message) => String(message.author || "").trim())
        .filter(Boolean)
        .concat(
          [handoff.sourceAgent, handoff.targetAgent, handoff.claimedBy]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
    )
  );

  return {
    id: handoff.id,
    status: handoff.status,
    participants,
    messageCount: messages.length,
    lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    updatedAt: getHandoffLastActivityAt(handoff)
  };
}

export function getThreadLastActivityAt(thread = {}) {
  const timestamps = [toTimestamp(thread.updatedAt), toTimestamp(thread.createdAt)];

  for (const message of Array.isArray(thread.messages) ? thread.messages : []) {
    timestamps.push(toTimestamp(message.createdAt));
  }

  const last = Math.max(...timestamps, 0);
  return last ? new Date(last).toISOString() : null;
}

export function toInboxItem(handoff = {}, options = {}) {
  const lastReadAt = options.resolveLastReadAt
    ? options.resolveLastReadAt(handoff.threadId ?? null, handoff)
    : options.lastReadAt;
  const unread = options.includeUnread ? isUnreadHandoff(handoff, lastReadAt) : null;

  return {
    id: handoff.id,
    threadId: handoff.threadId ?? null,
    channel: handoff.channel,
    targetAgent: handoff.targetAgent,
    sourceAgent: handoff.sourceAgent,
    title: handoff.title,
    status: handoff.status,
    priority: handoff.priority,
    createdAt: handoff.createdAt,
    updatedAt: getHandoffLastActivityAt(handoff),
    claimedAt: handoff.claimedAt ?? null,
    completedAt: handoff.completedAt ?? null,
    claimedBy: handoff.claimedBy ?? null,
    payload: handoff.payload ?? {},
    artifactCount: Array.isArray(handoff.artifacts) ? handoff.artifacts.length : 0,
    messageCount: Array.isArray(handoff.messages) ? handoff.messages.length : 0,
    unread
  };
}

function getLatestHandoff(handoffs = []) {
  return handoffs
    .slice()
    .sort((a, b) => toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a)))[0] ?? null;
}

function buildSyntheticThreadsFromHandoffs(handoffs = [], existingThreadIds = new Set()) {
  const groups = new Map();

  for (const handoff of handoffs) {
    const syntheticId = handoff.threadId ?? `handoff:${handoff.id}`;
    if (handoff.threadId && existingThreadIds.has(handoff.threadId)) {
      continue;
    }

    const group = groups.get(syntheticId) ?? [];
    group.push(handoff);
    groups.set(syntheticId, group);
  }

  return Array.from(groups.entries()).map(([id, relatedHandoffs]) => {
    const latestHandoff = getLatestHandoff(relatedHandoffs);
    const createdAtCandidates = relatedHandoffs.map((handoff) => toTimestamp(handoff.createdAt)).filter(Boolean);
    const createdAtTimestamp = createdAtCandidates.length > 0 ? Math.min(...createdAtCandidates) : 0;
    const updatedAt = getNextCursor(
      null,
      relatedHandoffs.map((handoff) => getHandoffLastActivityAt(handoff))
    );
    const messages = relatedHandoffs
      .flatMap((handoff) => (Array.isArray(handoff.messages) ? handoff.messages : []))
      .slice()
      .sort((a, b) => toTimestamp(a?.createdAt) - toTimestamp(b?.createdAt));

    return {
      id,
      channel: latestHandoff?.channel ?? null,
      sourceAgent: latestHandoff?.sourceAgent ?? null,
      targetAgent: latestHandoff?.targetAgent ?? null,
      title: latestHandoff?.title ?? null,
      status: latestHandoff?.status ?? "open",
      createdAt: createdAtTimestamp ? new Date(createdAtTimestamp).toISOString() : null,
      updatedAt,
      handoffIds: relatedHandoffs.map((handoff) => handoff.id),
      messages
    };
  });
}

function normalizeMailboxCollections(collections = []) {
  if (Array.isArray(collections)) {
    return {
      handoffs: collections,
      threads: buildSyntheticThreadsFromHandoffs(collections)
    };
  }

  const handoffs = Array.isArray(collections?.handoffs) ? collections.handoffs : [];
  const threads = Array.isArray(collections?.threads) ? collections.threads : [];
  const existingThreadIds = new Set(threads.map((thread) => thread?.id).filter(Boolean));

  return {
    handoffs,
    threads: threads.concat(buildSyntheticThreadsFromHandoffs(handoffs, existingThreadIds))
  };
}

function matchesThreadStatus(thread = {}, relatedHandoffs = [], statuses) {
  if (!statuses || statuses.length === 0) {
    return true;
  }

  const values = new Set(
    [thread.status]
      .concat(relatedHandoffs.map((handoff) => handoff.status))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  return statuses.some((status) => values.has(status));
}

function matchesThreadOrHandoffField(thread = {}, relatedHandoffs = [], field, expected) {
  if (!expected) {
    return true;
  }

  const matches = (item = {}) => String(item?.[field] || "").trim() === expected;
  return matches(thread) || relatedHandoffs.some(matches);
}

export function toThreadMailboxItem(thread = {}, relatedHandoffs = [], options = {}) {
  const latestHandoff = getLatestHandoff(relatedHandoffs);
  const latestThreadActivityAt = getThreadLastActivityAt(thread);
  const updatedAt = getNextCursor(latestThreadActivityAt, relatedHandoffs.map((handoff) => getHandoffLastActivityAt(handoff)));
  const lastReadAt = options.resolveLastReadAt
    ? options.resolveLastReadAt(thread.id, thread, relatedHandoffs)
    : options.lastReadAt ?? null;
  const unread = options.includeUnread ? isUnreadActivity(updatedAt, lastReadAt) : null;
  const threadHandoffIds = new Set(
    []
      .concat(Array.isArray(thread.handoffIds) ? thread.handoffIds : [])
      .concat(relatedHandoffs.map((handoff) => handoff.id))
  );
  const messages = Array.isArray(thread.messages) ? thread.messages : [];

  return {
    id: thread.id,
    channel: thread.channel,
    targetAgent: thread.targetAgent,
    sourceAgent: thread.sourceAgent,
    title: thread.title,
    status: latestHandoff?.status ?? thread.status ?? "open",
    threadStatus: thread.status ?? "open",
    latestHandoffStatus: latestHandoff?.status ?? null,
    createdAt: thread.createdAt ?? null,
    updatedAt,
    handoffIds: Array.from(threadHandoffIds),
    handoffCount: threadHandoffIds.size,
    messageCount: messages.length,
    lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    latestHandoffId: latestHandoff?.id ?? null,
    latestHandoff: latestHandoff
      ? toInboxItem(latestHandoff, {
          includeUnread: true,
          resolveLastReadAt: options.resolveLastReadAt,
          lastReadAt
        })
      : null,
    lastReadAt,
    unread
  };
}

export function buildThreadInbox(threads = [], handoffs = [], input = {}) {
  const agent = String(input.agent || "").trim();
  const channel = input.channel ? String(input.channel).trim() : undefined;
  const sourceAgent = input.sourceAgent ? String(input.sourceAgent).trim() : undefined;
  const targetAgent = input.targetAgent ? String(input.targetAgent).trim() : undefined;
  const statuses = normalizeStatusFilter(input.statuses ?? input.status);
  const after = toTimestamp(input.after ?? input.since);
  const threadId = input.threadId ? String(input.threadId).trim() : undefined;
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(100, Math.trunc(input.limit)))
      : 20;
  const handoffsByThread = new Map();

  for (const handoff of handoffs) {
    const threadKey = handoff.threadId ?? `handoff:${handoff.id}`;
    const related = handoffsByThread.get(threadKey) ?? [];
    related.push(handoff);
    handoffsByThread.set(threadKey, related);
  }

  let items = threads
    .filter(Boolean)
    .filter((thread) => {
      const relatedHandoffs = handoffsByThread.get(thread.id) ?? [];
      return matchesThreadOrHandoffField(thread, relatedHandoffs, "targetAgent", agent)
        && matchesThreadOrHandoffField(thread, relatedHandoffs, "targetAgent", targetAgent)
        && matchesThreadOrHandoffField(thread, relatedHandoffs, "sourceAgent", sourceAgent)
        && (!threadId || thread.id === threadId)
        && matchesThreadOrHandoffField(thread, relatedHandoffs, "channel", channel)
        && matchesThreadStatus(thread, relatedHandoffs, statuses);
    })
    .map((thread) =>
      toThreadMailboxItem(thread, handoffsByThread.get(thread.id) ?? [], {
        includeUnread: true,
        resolveLastReadAt: (currentThreadId) => resolveLastReadAt(input, currentThreadId)
      })
    )
    .filter((thread) => !after || toTimestamp(thread.updatedAt) > after);

  items = items.sort((a, b) => {
    if (agent || targetAgent) {
      if (a.unread !== b.unread) {
        return a.unread ? -1 : 1;
      }
    }

    return toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
  });

  return items.slice(0, limit);
}

export function buildAgentInbox(handoffs = [], input = {}) {
  const agent = String(input.agent || "").trim();
  if (!agent) {
    throw new Error("agent is required");
  }

  const channel = input.channel ? String(input.channel).trim() : undefined;
  const statuses = normalizeStatusFilter(input.statuses ?? input.status);
  const after = toTimestamp(input.after ?? input.since);
  const includeClosed = Boolean(input.includeClosed);
  const threadId = input.threadId ? String(input.threadId).trim() : undefined;
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(100, Math.trunc(input.limit)))
      : 20;

  let items = handoffs.filter((handoff) => handoff.targetAgent === agent);

  if (channel) {
    items = items.filter((handoff) => handoff.channel === channel);
  }

  if (threadId) {
    items = items.filter((handoff) => handoff.threadId === threadId);
  }

  const effectiveStatuses =
    statuses && statuses.length > 0
      ? statuses
      : includeClosed
        ? undefined
        : ["pending", "claimed", "blocked"];

  if (effectiveStatuses && effectiveStatuses.length > 0) {
    items = items.filter((handoff) => effectiveStatuses.includes(handoff.status));
  }

  if (after) {
    items = items.filter((handoff) => toTimestamp(getHandoffLastActivityAt(handoff)) > after);
  }

  return items
    .sort((a, b) => {
      const aUnread = isUnreadHandoff(a, resolveLastReadAt(input, a.threadId ?? null));
      const bUnread = isUnreadHandoff(b, resolveLastReadAt(input, b.threadId ?? null));

      if (aUnread !== bUnread) {
        return aUnread ? -1 : 1;
      }

      return toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a));
    })
    .slice(0, limit)
    .map((handoff) =>
      toInboxItem(handoff, {
        includeUnread: true,
        resolveLastReadAt: (currentThreadId) => resolveLastReadAt(input, currentThreadId)
      })
    );
}

export function buildMailboxSnapshot(handoffs = [], input = {}) {
  const collections = normalizeMailboxCollections(handoffs);
  const lastReadAt = input.agent ? resolveLastReadAt(input, input.threadId ? String(input.threadId).trim() : null) : null;
  const handoffItems = input.agent
    ? buildAgentInbox(collections.handoffs, input)
    : collections.handoffs
        .slice()
        .sort((a, b) => toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a)))
        .map(toInboxItem);
  const threadItems = buildThreadInbox(collections.threads, collections.handoffs, input);
  const unreadCount = input.agent ? threadItems.filter((item) => item.unread).length : null;
  const cursor = getNextCursor(
    input.after ?? input.since,
    threadItems.map((item) => item.updatedAt)
  );

  return {
    mailbox: {
      agent: input.agent ? String(input.agent).trim() : null,
      threadId: input.threadId ? String(input.threadId).trim() : null,
      after: input.after ?? input.since ?? null,
      lastReadAt,
      unreadCount,
      total: threadItems.length,
      handoffTotal: handoffItems.length,
      nextAfter: cursor,
      cursor
    },
    threads: threadItems,
    handoffs: handoffItems
  };
}

export function buildConversationSnapshot(handoff = {}, input = {}) {
  const after = input.after ?? input.since ?? null;
  const artifacts = filterAfterCursor(
    Array.isArray(handoff.artifacts) ? handoff.artifacts : [],
    after,
    (artifact) => artifact?.createdAt
  );
  const messages = filterAfterCursor(
    Array.isArray(handoff.messages) ? handoff.messages : [],
    after,
    (message) => message?.createdAt
  );
  const updatedAt = getHandoffLastActivityAt(handoff);
  const statusChanged = toTimestamp(updatedAt) > toTimestamp(after);
  const nextAfter = getNextCursor(after, [
    updatedAt,
    ...artifacts.map((artifact) => artifact?.createdAt),
    ...messages.map((message) => message?.createdAt)
  ]);

  return {
    handoff: toInboxItem(handoff),
    summary: summarizeConversation(handoff),
    payload: handoff.payload ?? {},
    artifacts,
    messages,
    delta: {
      after,
      nextAfter,
      messageCount: messages.length,
      artifactCount: artifacts.length,
      statusChanged,
      hasChanges: messages.length > 0 || artifacts.length > 0 || statusChanged
    }
  };
}
