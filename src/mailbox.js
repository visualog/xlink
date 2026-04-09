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

export function toInboxItem(handoff = {}) {
  return {
    id: handoff.id,
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
    messageCount: Array.isArray(handoff.messages) ? handoff.messages.length : 0
  };
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
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(100, Math.trunc(input.limit)))
      : 20;

  let items = handoffs.filter((handoff) => handoff.targetAgent === agent);

  if (channel) {
    items = items.filter((handoff) => handoff.channel === channel);
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
    .sort((a, b) => toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a)))
    .slice(0, limit)
    .map(toInboxItem);
}

export function buildMailboxSnapshot(handoffs = [], input = {}) {
  const items = input.agent
    ? buildAgentInbox(handoffs, input)
    : handoffs
        .slice()
        .sort((a, b) => toTimestamp(getHandoffLastActivityAt(b)) - toTimestamp(getHandoffLastActivityAt(a)))
        .map(toInboxItem);

  return {
    mailbox: {
      agent: input.agent ? String(input.agent).trim() : null,
      after: input.after ?? input.since ?? null,
      total: items.length,
      nextAfter: items.length > 0 ? items[0].updatedAt : toIsoOrNull(input.after ?? input.since)
    },
    handoffs: items
  };
}

export function buildConversationSnapshot(handoff = {}) {
  return {
    handoff: toInboxItem(handoff),
    summary: summarizeConversation(handoff),
    payload: handoff.payload ?? {},
    artifacts: Array.isArray(handoff.artifacts) ? handoff.artifacts : [],
    messages: Array.isArray(handoff.messages) ? handoff.messages : []
  };
}
