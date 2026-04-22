import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const VALID_STATUSES = new Set(["pending", "claimed", "completed", "rejected", "blocked"]);
const VALID_THREAD_STATUSES = new Set(["open", "resolved", "archived"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const HANDOFF_CHANNELS = new Set(["devlog", "bridge", "figma", "docs", "review"]);
const GLOBAL_MAILBOX_SCOPE = "__global__";

export class StoreError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "StoreError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function makeHandoffId(existingIds, now = new Date()) {
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const prefix = `handoff_${year}_${month}_${day}_`;
  const sequence = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);

  const next = sequence.length ? sequence[sequence.length - 1] + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function makeThreadId(existingIds, now = new Date()) {
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const prefix = `thread_${year}_${month}_${day}_`;
  const sequence = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);

  const next = sequence.length ? sequence[sequence.length - 1] + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoreError(400, `${fieldName} must be an object.`);
  }
}

function assertString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new StoreError(400, `${fieldName} must be a non-empty string.`);
  }
}

function optionalString(value, fieldName) {
  if (value == null) {
    return;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new StoreError(400, `${fieldName} must be a non-empty string when provided.`);
  }
}

function assertStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new StoreError(400, `${fieldName} must be a non-empty array of strings.`);
  }
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter(Boolean);
}

function ensureStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new StoreError(400, `status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`);
  }
}

function ensureChannel(channel) {
  if (!HANDOFF_CHANNELS.has(channel)) {
    throw new StoreError(400, `channel must be one of: ${Array.from(HANDOFF_CHANNELS).join(", ")}`);
  }
}

function ensurePriority(priority) {
  if (!VALID_PRIORITIES.has(priority)) {
    throw new StoreError(400, `priority must be one of: ${Array.from(VALID_PRIORITIES).join(", ")}`);
  }
}

function ensureThreadStatus(status) {
  if (!VALID_THREAD_STATUSES.has(status)) {
    throw new StoreError(400, `thread status must be one of: ${Array.from(VALID_THREAD_STATUSES).join(", ")}`);
  }
}

function validatePayload(payload) {
  assertObject(payload, "payload");
  assertString(payload.type, "payload.type");
  assertString(payload.title, "payload.title");
  assertString(payload.date, "payload.date");
  assertStringArray(payload.details, "payload.details");
  assertStringArray(payload.tags, "payload.tags");
}

function validateArtifactInput(artifact) {
  assertObject(artifact, "artifact");
  assertString(artifact.type, "artifact.type");
  assertString(artifact.path, "artifact.path");
}

function toIsoString(value) {
  return new Date(value).toISOString();
}

function toIsoStringOrThrow(value, fieldName) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new StoreError(400, `${fieldName} must be a valid ISO timestamp.`);
  }

  return new Date(parsed).toISOString();
}

function normalizeArtifact(artifact) {
  validateArtifactInput(artifact);

  return {
    type: artifact.type,
    path: artifact.path,
    label: artifact.label ?? artifact.type
  };
}

function normalizeUpdatedAt(input, fallback = new Date()) {
  return input?.updatedAt ? toIsoString(input.updatedAt) : fallback.toISOString();
}

function normalizeMailboxScopeKey(threadId) {
  return threadId ? `thread:${threadId}` : GLOBAL_MAILBOX_SCOPE;
}

function normalizeMessage(message) {
  return {
    author: message.author,
    body: message.body,
    kind: message.kind ?? "note",
    createdAt: new Date().toISOString()
  };
}

function normalizeThreadInput(input, existingIds = []) {
  assertObject(input, "body");
  assertString(input.channel, "channel");
  assertString(input.sourceAgent, "sourceAgent");
  assertString(input.targetAgent, "targetAgent");
  assertString(input.title, "title");
  optionalString(input.status, "status");

  ensureChannel(input.channel);
  ensureThreadStatus(input.status ?? "open");

  const now = new Date();
  const id = input.id?.trim() || makeThreadId(existingIds, now);

  return {
    id,
    channel: input.channel,
    sourceAgent: input.sourceAgent,
    targetAgent: input.targetAgent,
    title: input.title,
    status: input.status ?? "open",
    createdAt: input.createdAt ? toIsoString(input.createdAt) : now.toISOString(),
    updatedAt: input.updatedAt ? toIsoString(input.updatedAt) : now.toISOString(),
    handoffIds: normalizeArray(input.handoffIds),
    messages: Array.isArray(input.messages) ? input.messages.map((message) => normalizeMessage(message)) : []
  };
}

function normalizeHandoffInput(input, existingIds = []) {
  assertObject(input, "body");
  assertString(input.channel, "channel");
  assertString(input.targetAgent, "targetAgent");
  assertString(input.sourceAgent, "sourceAgent");
  assertString(input.title, "title");
  optionalString(input.threadId, "threadId");
  validatePayload(input.payload);

  ensureChannel(input.channel);
  ensurePriority(input.priority ?? "medium");

  const now = new Date();
  const id = input.id?.trim() || makeHandoffId(existingIds, now);

  return {
    id,
    channel: input.channel,
    targetAgent: input.targetAgent,
    sourceAgent: input.sourceAgent,
    title: input.title,
    status: "pending",
    priority: input.priority ?? "medium",
    createdAt: input.createdAt ? toIsoString(input.createdAt) : now.toISOString(),
    updatedAt: input.updatedAt ? toIsoString(input.updatedAt) : now.toISOString(),
    claimedAt: null,
    completedAt: null,
    claimedBy: null,
    threadId: input.threadId?.trim() ?? null,
    payload: {
      ...input.payload,
      details: normalizeArray(input.payload.details),
      tags: normalizeArray(input.payload.tags),
      files: normalizeArray(input.payload.files),
      links: normalizeArray(input.payload.links)
    },
    artifacts: Array.isArray(input.artifacts) ? input.artifacts.map((artifact) => normalizeArtifact(artifact)) : [],
    messages: Array.isArray(input.messages) ? input.messages.map((message) => normalizeMessage(message)) : []
  };
}

function withFilters(items, filters = {}) {
  let next = items.slice();

  if (filters.status) {
    next = next.filter((item) => item.status === filters.status);
  }

  if (filters.channel) {
    next = next.filter((item) => item.channel === filters.channel);
  }

  if (filters.priority) {
    next = next.filter((item) => item.priority === filters.priority);
  }

  if (filters.targetAgent) {
    next = next.filter((item) => item.targetAgent === filters.targetAgent);
  }

  if (filters.sourceAgent) {
    next = next.filter((item) => item.sourceAgent === filters.sourceAgent);
  }

  if (filters.threadId) {
    next = next.filter((item) => item.threadId === filters.threadId);
  }

  if (filters.updatedSince) {
    const since = Date.parse(filters.updatedSince);
    if (Number.isFinite(since)) {
      next = next.filter((item) => {
        const updatedAt = Date.parse(
          item.updatedAt ?? item.completedAt ?? item.claimedAt ?? item.createdAt ?? 0
        );
        return Number.isFinite(updatedAt) ? updatedAt > since : true;
      });
    }
  }

  return next.sort((a, b) => {
    const aUpdated = a.updatedAt ?? a.completedAt ?? a.claimedAt ?? a.createdAt;
    const bUpdated = b.updatedAt ?? b.completedAt ?? b.claimedAt ?? b.createdAt;
    return bUpdated.localeCompare(aUpdated);
  });
}

function withThreadFilters(items, filters = {}) {
  let next = items.slice();

  if (filters.status) {
    next = next.filter((item) => item.status === filters.status);
  }

  if (filters.channel) {
    next = next.filter((item) => item.channel === filters.channel);
  }

  if (filters.targetAgent) {
    next = next.filter((item) => item.targetAgent === filters.targetAgent);
  }

  if (filters.sourceAgent) {
    next = next.filter((item) => item.sourceAgent === filters.sourceAgent);
  }

  if (filters.threadId) {
    next = next.filter((item) => item.id === filters.threadId);
  }

  if (filters.updatedSince) {
    const since = Date.parse(filters.updatedSince);
    if (Number.isFinite(since)) {
      next = next.filter((item) => {
        const updatedAt = Date.parse(item.updatedAt ?? item.createdAt ?? 0);
        return Number.isFinite(updatedAt) ? updatedAt > since : true;
      });
    }
  }

  return next.sort((a, b) => {
    const aUpdated = a.updatedAt ?? a.createdAt;
    const bUpdated = b.updatedAt ?? b.createdAt;
    return bUpdated.localeCompare(aUpdated);
  });
}

function normalizeSnapshot(handoff) {
  return {
    id: handoff.id,
    channel: handoff.channel,
    targetAgent: handoff.targetAgent,
    sourceAgent: handoff.sourceAgent,
    title: handoff.title,
    status: handoff.status,
    priority: handoff.priority ?? "medium",
    createdAt: handoff.createdAt,
    updatedAt: handoff.updatedAt ?? normalizeUpdatedAt(handoff, new Date(handoff.createdAt ?? Date.now())),
    claimedAt: handoff.claimedAt ?? null,
    completedAt: handoff.completedAt ?? null,
    claimedBy: handoff.claimedBy ?? null,
    threadId: handoff.threadId ?? null,
    payload: handoff.payload ?? {},
    artifacts: Array.isArray(handoff.artifacts) ? handoff.artifacts : [],
    messages: Array.isArray(handoff.messages) ? handoff.messages : []
  };
}

function normalizeThreadSnapshot(thread) {
  return {
    id: thread.id,
    channel: thread.channel,
    sourceAgent: thread.sourceAgent,
    targetAgent: thread.targetAgent,
    title: thread.title,
    status: thread.status ?? "open",
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt ?? normalizeUpdatedAt(thread, new Date(thread.createdAt ?? Date.now())),
    handoffIds: Array.isArray(thread.handoffIds) ? thread.handoffIds : [],
    messages: Array.isArray(thread.messages) ? thread.messages : []
  };
}

function buildThreadSeedFromHandoff(input = {}) {
  return {
    channel: input.channel,
    sourceAgent: input.sourceAgent,
    targetAgent: input.targetAgent,
    title: input.title
  };
}

function touchThreadFromHandoff(thread, handoff) {
  if (!thread || !handoff) {
    return;
  }

  if (!Array.isArray(thread.handoffIds)) {
    thread.handoffIds = [];
  }
  if (handoff.id && !thread.handoffIds.includes(handoff.id)) {
    thread.handoffIds.push(handoff.id);
  }
  thread.updatedAt = handoff.updatedAt ?? new Date().toISOString();
}

function appendThreadMessageFromHandoff(thread, message) {
  if (!thread || !message) {
    return;
  }

  if (!Array.isArray(thread.messages)) {
    thread.messages = [];
  }

  thread.messages.push(message);
  thread.updatedAt = message.createdAt ?? new Date().toISOString();
}

function normalizeMailboxRead(agent, input = {}) {
  assertString(agent, "agent");
  assertObject(input, "body");
  optionalString(input.threadId, "threadId");

  const now = new Date().toISOString();
  const requestedCursor = input.cursor == null ? now : toIsoStringOrThrow(input.cursor, "cursor");
  const threadId = input.threadId?.trim() ?? null;

  return {
    agent: agent.trim(),
    threadId,
    scopeKey: normalizeMailboxScopeKey(threadId),
    lastReadAt: requestedCursor,
    updatedAt: now
  };
}

function normalizeMailboxReadEntry(entry = {}) {
  const agent = String(entry.agent || "").trim();
  const threadId = typeof entry.threadId === "string" && entry.threadId.trim() ? entry.threadId.trim() : null;
  const scopeKey =
    typeof entry.scopeKey === "string" && entry.scopeKey.trim()
      ? entry.scopeKey.trim()
      : normalizeMailboxScopeKey(threadId);

  return {
    agent,
    threadId,
    scopeKey,
    lastReadAt: entry.lastReadAt ?? null,
    updatedAt: entry.updatedAt ?? null
  };
}

function findMailboxReadEntry(entries = [], agent, threadId = null) {
  const scopeKey = normalizeMailboxScopeKey(threadId);
  return entries.find((entry) => entry.agent === agent && entry.scopeKey === scopeKey) ?? null;
}

function buildMailboxReadState(entries = [], agent, threadId = null) {
  const globalEntry = findMailboxReadEntry(entries, agent, null);
  const scopedEntry = threadId ? findMailboxReadEntry(entries, agent, threadId) : globalEntry;
  const globalTimestamp = Date.parse(globalEntry?.lastReadAt ?? 0);
  const scopedTimestamp = Date.parse(scopedEntry?.lastReadAt ?? 0);
  const effectiveEntry =
    threadId && Number.isFinite(scopedTimestamp) && scopedTimestamp > (Number.isFinite(globalTimestamp) ? globalTimestamp : 0)
      ? scopedEntry
      : globalEntry;

  return {
    agent,
    threadId,
    lastReadAt: effectiveEntry?.lastReadAt ?? null,
    updatedAt: effectiveEntry?.updatedAt ?? null,
    globalLastReadAt: globalEntry?.lastReadAt ?? null,
    threadLastReadAt: threadId ? scopedEntry?.lastReadAt ?? null : null
  };
}

function listMailboxReadsForAgent(entries = [], agent) {
  return entries.filter((entry) => entry.agent === agent).map((entry) => ({
    agent: entry.agent,
    threadId: entry.threadId ?? null,
    lastReadAt: entry.lastReadAt ?? null,
    updatedAt: entry.updatedAt ?? null
  }));
}

export class JsonHandoffStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.#write({ handoffs: [], threads: [], mailboxReads: [] });
    }
  }

  async list(filters = {}) {
    const state = await this.#read();
    return withFilters(state.handoffs, filters);
  }

  async getById(id) {
    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    return handoff;
  }

  async listThreads(filters = {}) {
    const state = await this.#read();
    return withThreadFilters(state.threads, filters);
  }

  async getThreadById(id) {
    const state = await this.#read();
    const thread = state.threads.find((item) => item.id === id);

    if (!thread) {
      throw new StoreError(404, `thread ${id} was not found.`);
    }

    return thread;
  }

  async create(input) {
    const state = await this.#read();
    let thread = null;
    let threadId = input.threadId?.trim() ?? null;

    if (threadId) {
      thread = state.threads.find((item) => item.id === threadId);
      if (!thread) {
        throw new StoreError(404, `thread ${threadId} was not found.`);
      }
    } else {
      thread = normalizeThreadInput(buildThreadSeedFromHandoff(input), state.threads.map((item) => item.id));
      threadId = thread.id;
      state.threads.push(thread);
    }

    const handoff = normalizeHandoffInput(
      {
        ...input,
        threadId
      },
      state.handoffs.map((item) => item.id)
    );

    if (state.handoffs.some((item) => item.id === handoff.id)) {
      throw new StoreError(409, `handoff ${handoff.id} already exists.`);
    }

    state.handoffs.push(handoff);
    touchThreadFromHandoff(thread, handoff);
    for (const message of handoff.messages) {
      appendThreadMessageFromHandoff(thread, message);
    }
    await this.#write(state);
    return handoff;
  }

  async createThread(input) {
    const state = await this.#read();
    const thread = normalizeThreadInput(input, state.threads.map((item) => item.id));

    if (state.threads.some((item) => item.id === thread.id)) {
      throw new StoreError(409, `thread ${thread.id} already exists.`);
    }

    state.threads.push(thread);
    await this.#write(state);
    return thread;
  }

  async appendThreadMessage(id, input) {
    assertObject(input, "body");
    assertString(input.author, "author");
    assertString(input.body, "body");
    optionalString(input.kind, "kind");

    const state = await this.#read();
    const thread = state.threads.find((item) => item.id === id);

    if (!thread) {
      throw new StoreError(404, `thread ${id} was not found.`);
    }

    thread.messages.push(this.#normalizeMessage(input));
    thread.updatedAt = new Date().toISOString();

    await this.#write(state);
    return thread;
  }

  async createThreadHandoff(id, input) {
    const handoff = await this.create({
      ...input,
      threadId: id,
      channel: input.channel ?? (await this.getThreadById(id)).channel,
      sourceAgent: input.sourceAgent ?? (await this.getThreadById(id)).sourceAgent,
      targetAgent: input.targetAgent ?? (await this.getThreadById(id)).targetAgent,
      title: input.title ?? (await this.getThreadById(id)).title
    });

    return {
      thread: await this.getThreadById(id),
      handoff
    };
  }

  async getMailboxReadState(agent, input = {}) {
    assertString(agent, "agent");

    const state = await this.#read();
    return buildMailboxReadState(state.mailboxReads, agent.trim(), input.threadId?.trim() ?? null);
  }

  async listMailboxReadStates(agent) {
    assertString(agent, "agent");

    const state = await this.#read();
    return listMailboxReadsForAgent(state.mailboxReads, agent.trim());
  }

  async ackMailbox(agent, input = {}) {
    const state = await this.#read();
    const next = normalizeMailboxRead(agent, input);
    const index = state.mailboxReads.findIndex(
      (entry) => entry.agent === next.agent && entry.scopeKey === next.scopeKey
    );
    const previous = index >= 0 ? state.mailboxReads[index] : null;
    const globalPrevious = next.threadId ? findMailboxReadEntry(state.mailboxReads, next.agent, null) : null;
    const previousTimestamp = Math.max(
      Date.parse(previous?.lastReadAt ?? 0) || 0,
      Date.parse(globalPrevious?.lastReadAt ?? 0) || 0
    );

    if (previousTimestamp > (Date.parse(next.lastReadAt) || 0)) {
      next.lastReadAt = new Date(previousTimestamp).toISOString();
    }

    if (index === -1) {
      state.mailboxReads.push(next);
    } else {
      state.mailboxReads[index] = next;
    }

    await this.#write(state);
    return buildMailboxReadState(state.mailboxReads, next.agent, next.threadId);
  }

  async upsertSnapshot(handoff) {
    const state = await this.#read();
    const snapshot = normalizeSnapshot(handoff);
    const index = state.handoffs.findIndex((item) => item.id === snapshot.id);

    if (index === -1) {
      state.handoffs.push(snapshot);
    } else {
      state.handoffs[index] = snapshot;
    }

    if (snapshot.threadId) {
      let thread = state.threads.find((item) => item.id === snapshot.threadId);
      if (!thread) {
        thread = normalizeThreadInput(buildThreadSeedFromHandoff(snapshot), state.threads.map((item) => item.id).concat(snapshot.threadId));
        thread.id = snapshot.threadId;
        state.threads.push(thread);
      }
      touchThreadFromHandoff(thread, snapshot);
    }

    await this.#write(state);
    return snapshot;
  }

  async claim(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    optionalString(input.note, "note");

    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    if (handoff.status !== "pending") {
      throw new StoreError(409, `handoff ${id} cannot be claimed from status ${handoff.status}.`);
    }

    handoff.status = "claimed";
    handoff.claimedAt = new Date().toISOString();
    handoff.claimedBy = input.agent;
    handoff.updatedAt = new Date().toISOString();

    if (input.note) {
      const message = this.#normalizeMessage({ author: input.agent, body: input.note });
      handoff.messages.push(message);
      if (handoff.threadId) {
        const thread = state.threads.find((item) => item.id === handoff.threadId);
        appendThreadMessageFromHandoff(thread, message);
      }
    }

    if (handoff.threadId) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      touchThreadFromHandoff(thread, handoff);
    }

    await this.#write(state);
    return handoff;
  }

  async complete(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    assertString(input.result, "result");

    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    if (!["claimed", "blocked"].includes(handoff.status)) {
      throw new StoreError(409, `handoff ${id} cannot be completed from status ${handoff.status}.`);
    }

    handoff.status = "completed";
    handoff.completedAt = new Date().toISOString();
    handoff.updatedAt = new Date().toISOString();
    const message = this.#normalizeMessage({ author: input.agent, body: input.result, kind: "result" });
    handoff.messages.push(message);

    if (handoff.threadId) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      appendThreadMessageFromHandoff(thread, message);
      touchThreadFromHandoff(thread, handoff);
    }

    await this.#write(state);
    return handoff;
  }

  async block(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    assertString(input.reason, "reason");

    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    if (!["pending", "claimed"].includes(handoff.status)) {
      throw new StoreError(409, `handoff ${id} cannot be blocked from status ${handoff.status}.`);
    }

    handoff.status = "blocked";
    handoff.updatedAt = new Date().toISOString();
    const message = this.#normalizeMessage({ author: input.agent, body: input.reason, kind: "blocked" });
    handoff.messages.push(message);

    if (handoff.threadId) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      appendThreadMessageFromHandoff(thread, message);
      touchThreadFromHandoff(thread, handoff);
    }

    await this.#write(state);
    return handoff;
  }

  async reject(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    assertString(input.reason, "reason");

    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    if (!["pending", "claimed"].includes(handoff.status)) {
      throw new StoreError(409, `handoff ${id} cannot be rejected from status ${handoff.status}.`);
    }

    handoff.status = "rejected";
    handoff.updatedAt = new Date().toISOString();
    const message = this.#normalizeMessage({ author: input.agent, body: input.reason, kind: "rejected" });
    handoff.messages.push(message);

    if (handoff.threadId) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      appendThreadMessageFromHandoff(thread, message);
      touchThreadFromHandoff(thread, handoff);
    }

    await this.#write(state);
    return handoff;
  }

  async addArtifact(id, input) {
    validateArtifactInput(input);

    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    const artifact = this.#normalizeArtifact(input);
    handoff.artifacts.push(artifact);
    handoff.updatedAt = new Date().toISOString();

    if (handoff.threadId) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      touchThreadFromHandoff(thread, handoff);
    }

    await this.#write(state);
    return handoff;
  }

  async appendMessage(id, input) {
    assertObject(input, "body");
    assertString(input.author, "author");
    assertString(input.body, "body");
    optionalString(input.kind, "kind");

    const state = await this.#read();
    const handoff = state.handoffs.find((item) => item.id === id);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    const message = this.#normalizeMessage(input);
    handoff.messages.push(message);
    handoff.updatedAt = new Date().toISOString();

    if (handoff.threadId) {
      const thread = state.threads.find((item) => item.id === handoff.threadId);
      appendThreadMessageFromHandoff(thread, message);
      touchThreadFromHandoff(thread, handoff);
    }

    await this.#write(state);
    return handoff;
  }

  #normalizeArtifact(artifact) {
    return normalizeArtifact(artifact);
  }

  #normalizeMessage(message) {
    return normalizeMessage(message);
  }

  async #read() {
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.handoffs)) {
      throw new StoreError(500, "handoff store is malformed.");
    }

    return {
      handoffs: parsed.handoffs,
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      mailboxReads: Array.isArray(parsed.mailboxReads) ? parsed.mailboxReads.map((entry) => normalizeMailboxReadEntry(entry)) : []
    };
  }

  async #write(state) {
    const tempPath = `${this.filePath}.tmp`;
    const payload = JSON.stringify(state, null, 2);
    await fs.writeFile(tempPath, `${payload}\n`, "utf8");
    await fs.rename(tempPath, this.filePath);
  }
}

function rowToHandoff(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    channel: row.channel,
    targetAgent: row.target_agent,
    sourceAgent: row.source_agent,
    title: row.title,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
    claimedBy: row.claimed_by,
    threadId: row.thread_id ?? null,
    payload: JSON.parse(row.payload_json),
    artifacts: JSON.parse(row.artifacts_json),
    messages: JSON.parse(row.messages_json)
  };
}

function rowToThread(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    channel: row.channel,
    sourceAgent: row.source_agent,
    targetAgent: row.target_agent,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    handoffIds: JSON.parse(row.handoff_ids_json),
    messages: JSON.parse(row.messages_json)
  };
}

function rowToMailboxRead(row) {
  if (!row) {
    return null;
  }

  return normalizeMailboxReadEntry({
    agent: row.agent,
    threadId: row.thread_id ?? null,
    scopeKey: row.scope_key ?? normalizeMailboxScopeKey(row.thread_id ?? null),
    lastReadAt: row.last_read_at ?? null,
    updatedAt: row.updated_at ?? null
  });
}

export class SqliteHandoffStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY,
        thread_id TEXT,
        channel TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        source_agent TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT,
        completed_at TEXT,
        claimed_by TEXT,
        payload_json TEXT NOT NULL,
        artifacts_json TEXT NOT NULL,
        messages_json TEXT NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        source_agent TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        handoff_ids_json TEXT NOT NULL,
        messages_json TEXT NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mailbox_reads (
        agent TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        thread_id TEXT,
        last_read_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent, scope_key)
      );
    `);

    const columns = this.db.prepare("PRAGMA table_info(handoffs)").all();
    const hasUpdatedAt = columns.some((column) => column.name === "updated_at");
    const hasThreadId = columns.some((column) => column.name === "thread_id");
    const mailboxReadColumns = this.db.prepare("PRAGMA table_info(mailbox_reads)").all();
    const hasMailboxScopeKey = mailboxReadColumns.some((column) => column.name === "scope_key");
    const hasMailboxThreadId = mailboxReadColumns.some((column) => column.name === "thread_id");

    if (!hasUpdatedAt) {
      this.db.exec("ALTER TABLE handoffs ADD COLUMN updated_at TEXT;");
      this.db.exec("UPDATE handoffs SET updated_at = COALESCE(updated_at, created_at);");
    }
    if (!hasThreadId) {
      this.db.exec("ALTER TABLE handoffs ADD COLUMN thread_id TEXT;");
    }

    if (!hasMailboxScopeKey || !hasMailboxThreadId) {
      this.db.exec(`
        CREATE TABLE mailbox_reads_v2 (
          agent TEXT NOT NULL,
          scope_key TEXT NOT NULL,
          thread_id TEXT,
          last_read_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (agent, scope_key)
        );
      `);
      this.db.exec(`
        INSERT INTO mailbox_reads_v2 (agent, scope_key, thread_id, last_read_at, updated_at)
        SELECT agent, '${GLOBAL_MAILBOX_SCOPE}', NULL, last_read_at, updated_at
        FROM mailbox_reads;
      `);
      this.db.exec("DROP TABLE mailbox_reads;");
      this.db.exec("ALTER TABLE mailbox_reads_v2 RENAME TO mailbox_reads;");
    }
  }

  async list(filters = {}) {
    const clauses = [];
    const params = {};

    if (filters.status) {
      clauses.push("status = $status");
      params.status = filters.status;
    }
    if (filters.channel) {
      clauses.push("channel = $channel");
      params.channel = filters.channel;
    }
    if (filters.priority) {
      clauses.push("priority = $priority");
      params.priority = filters.priority;
    }
    if (filters.targetAgent) {
      clauses.push("target_agent = $targetAgent");
      params.targetAgent = filters.targetAgent;
    }
    if (filters.sourceAgent) {
      clauses.push("source_agent = $sourceAgent");
      params.sourceAgent = filters.sourceAgent;
    }
    if (filters.threadId) {
      clauses.push("thread_id = $threadId");
      params.threadId = filters.threadId;
    }
    if (filters.updatedSince) {
      clauses.push("updated_at > $updatedSince");
      params.updatedSince = filters.updatedSince;
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM handoffs ${where} ORDER BY COALESCE(updated_at, created_at) DESC`).all(params);
    return rows.map(rowToHandoff);
  }

  async getById(id) {
    const row = this.db.prepare("SELECT * FROM handoffs WHERE id = ?").get(id);
    const handoff = rowToHandoff(row);

    if (!handoff) {
      throw new StoreError(404, `handoff ${id} was not found.`);
    }

    return handoff;
  }

  async listThreads(filters = {}) {
    const clauses = [];
    const params = {};

    if (filters.status) {
      clauses.push("status = $status");
      params.status = filters.status;
    }
    if (filters.channel) {
      clauses.push("channel = $channel");
      params.channel = filters.channel;
    }
    if (filters.targetAgent) {
      clauses.push("target_agent = $targetAgent");
      params.targetAgent = filters.targetAgent;
    }
    if (filters.sourceAgent) {
      clauses.push("source_agent = $sourceAgent");
      params.sourceAgent = filters.sourceAgent;
    }
    if (filters.threadId) {
      clauses.push("id = $threadId");
      params.threadId = filters.threadId;
    }
    if (filters.updatedSince) {
      clauses.push("updated_at > $updatedSince");
      params.updatedSince = filters.updatedSince;
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM threads ${where} ORDER BY COALESCE(updated_at, created_at) DESC`).all(params);
    return rows.map(rowToThread);
  }

  async getThreadById(id) {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(id);
    const thread = rowToThread(row);

    if (!thread) {
      throw new StoreError(404, `thread ${id} was not found.`);
    }

    return thread;
  }

  async create(input) {
    const ids = this.db.prepare("SELECT id FROM handoffs").all().map((row) => row.id);
    let thread = null;
    let threadId = input.threadId?.trim() ?? null;

    if (threadId) {
      thread = await this.getThreadById(threadId);
    } else {
      thread = await this.createThread(buildThreadSeedFromHandoff(input));
      threadId = thread.id;
    }

    const handoff = normalizeHandoffInput(
      {
        ...input,
        threadId
      },
      ids
    );

    try {
      this.#insertOrReplace(handoff, false);
      for (const message of handoff.messages) {
        appendThreadMessageFromHandoff(thread, message);
      }
      this.#touchLinkedThread(handoff);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new StoreError(409, `handoff ${handoff.id} already exists.`);
      }
      throw error;
    }

    return handoff;
  }

  async createThread(input) {
    const ids = this.db.prepare("SELECT id FROM threads").all().map((row) => row.id);
    const thread = normalizeThreadInput(input, ids);

    try {
      this.#insertOrReplaceThread(thread, false);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new StoreError(409, `thread ${thread.id} already exists.`);
      }
      throw error;
    }

    return thread;
  }

  async appendThreadMessage(id, input) {
    assertObject(input, "body");
    assertString(input.author, "author");
    assertString(input.body, "body");
    optionalString(input.kind, "kind");

    const thread = await this.getThreadById(id);
    thread.messages.push(normalizeMessage(input));
    thread.updatedAt = new Date().toISOString();
    this.#insertOrReplaceThread(thread, true);
    return thread;
  }

  async createThreadHandoff(id, input) {
    const thread = await this.getThreadById(id);
    const handoff = await this.create({
      ...input,
      threadId: id,
      channel: input.channel ?? thread.channel,
      sourceAgent: input.sourceAgent ?? thread.sourceAgent,
      targetAgent: input.targetAgent ?? thread.targetAgent,
      title: input.title ?? thread.title
    });

    return {
      thread: await this.getThreadById(id),
      handoff
    };
  }

  async getMailboxReadState(agent, input = {}) {
    assertString(agent, "agent");

    const rows = this.db.prepare("SELECT * FROM mailbox_reads WHERE agent = ?").all(agent.trim());
    return buildMailboxReadState(rows.map((row) => rowToMailboxRead(row)), agent.trim(), input.threadId?.trim() ?? null);
  }

  async listMailboxReadStates(agent) {
    assertString(agent, "agent");

    const rows = this.db.prepare("SELECT * FROM mailbox_reads WHERE agent = ?").all(agent.trim());
    return listMailboxReadsForAgent(rows.map((row) => rowToMailboxRead(row)), agent.trim());
  }

  async ackMailbox(agent, input = {}) {
    const next = normalizeMailboxRead(agent, input);
    const previous = await this.getMailboxReadState(next.agent, { threadId: next.threadId });

    if (previous.lastReadAt && Date.parse(previous.lastReadAt) > Date.parse(next.lastReadAt)) {
      next.lastReadAt = previous.lastReadAt;
    }

    this.db
      .prepare(`
        INSERT OR REPLACE INTO mailbox_reads (agent, scope_key, thread_id, last_read_at, updated_at)
        VALUES ($agent, $scopeKey, $threadId, $lastReadAt, $updatedAt)
      `)
      .run(next);

    return this.getMailboxReadState(next.agent, { threadId: next.threadId });
  }

  async upsertSnapshot(handoff) {
    const snapshot = normalizeSnapshot(handoff);
    this.#insertOrReplace(snapshot, true);
    this.#touchLinkedThread(snapshot);
    return snapshot;
  }

  async claim(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    optionalString(input.note, "note");

    const handoff = await this.getById(id);
    if (handoff.status !== "pending") {
      throw new StoreError(409, `handoff ${id} cannot be claimed from status ${handoff.status}.`);
    }

    handoff.status = "claimed";
    handoff.claimedAt = new Date().toISOString();
    handoff.claimedBy = input.agent;
    handoff.updatedAt = new Date().toISOString();
    if (input.note) {
      const message = normalizeMessage({ author: input.agent, body: input.note });
      handoff.messages.push(message);
      this.#appendThreadMessageToLinkedThread(handoff, message);
    }

    this.#insertOrReplace(handoff, true);
    this.#touchLinkedThread(handoff);
    return handoff;
  }

  async complete(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    assertString(input.result, "result");

    const handoff = await this.getById(id);
    if (!["claimed", "blocked"].includes(handoff.status)) {
      throw new StoreError(409, `handoff ${id} cannot be completed from status ${handoff.status}.`);
    }

    handoff.status = "completed";
    handoff.completedAt = new Date().toISOString();
    handoff.updatedAt = new Date().toISOString();
    const message = normalizeMessage({ author: input.agent, body: input.result, kind: "result" });
    handoff.messages.push(message);
    this.#insertOrReplace(handoff, true);
    this.#appendThreadMessageToLinkedThread(handoff, message);
    this.#touchLinkedThread(handoff);
    return handoff;
  }

  async block(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    assertString(input.reason, "reason");

    const handoff = await this.getById(id);
    if (!["pending", "claimed"].includes(handoff.status)) {
      throw new StoreError(409, `handoff ${id} cannot be blocked from status ${handoff.status}.`);
    }

    handoff.status = "blocked";
    handoff.updatedAt = new Date().toISOString();
    const message = normalizeMessage({ author: input.agent, body: input.reason, kind: "blocked" });
    handoff.messages.push(message);
    this.#insertOrReplace(handoff, true);
    this.#appendThreadMessageToLinkedThread(handoff, message);
    this.#touchLinkedThread(handoff);
    return handoff;
  }

  async reject(id, input) {
    assertObject(input, "body");
    assertString(input.agent, "agent");
    assertString(input.reason, "reason");

    const handoff = await this.getById(id);
    if (!["pending", "claimed"].includes(handoff.status)) {
      throw new StoreError(409, `handoff ${id} cannot be rejected from status ${handoff.status}.`);
    }

    handoff.status = "rejected";
    handoff.updatedAt = new Date().toISOString();
    const message = normalizeMessage({ author: input.agent, body: input.reason, kind: "rejected" });
    handoff.messages.push(message);
    this.#insertOrReplace(handoff, true);
    this.#appendThreadMessageToLinkedThread(handoff, message);
    this.#touchLinkedThread(handoff);
    return handoff;
  }

  async addArtifact(id, input) {
    const handoff = await this.getById(id);
    handoff.artifacts.push(normalizeArtifact(input));
    handoff.updatedAt = new Date().toISOString();
    this.#insertOrReplace(handoff, true);
    this.#touchLinkedThread(handoff);
    return handoff;
  }

  async appendMessage(id, input) {
    assertObject(input, "body");
    assertString(input.author, "author");
    assertString(input.body, "body");
    optionalString(input.kind, "kind");

    const handoff = await this.getById(id);
    const message = normalizeMessage(input);
    handoff.messages.push(message);
    handoff.updatedAt = new Date().toISOString();
    this.#insertOrReplace(handoff, true);
    this.#appendThreadMessageToLinkedThread(handoff, message);
    this.#touchLinkedThread(handoff);
    return handoff;
  }

  #insertOrReplace(handoff, replace = true) {
    const statement = this.db.prepare(`
      INSERT OR ${replace ? "REPLACE" : "ABORT"} INTO handoffs (
        id, thread_id, channel, target_agent, source_agent, title, status, priority,
        created_at, updated_at, claimed_at, completed_at, claimed_by,
        payload_json, artifacts_json, messages_json
      ) VALUES (
        $id, $threadId, $channel, $targetAgent, $sourceAgent, $title, $status, $priority,
        $createdAt, $updatedAt, $claimedAt, $completedAt, $claimedBy,
        $payload, $artifacts, $messages
      )
    `);

    statement.run({
      id: handoff.id,
      threadId: handoff.threadId ?? null,
      channel: handoff.channel,
      targetAgent: handoff.targetAgent,
      sourceAgent: handoff.sourceAgent,
      title: handoff.title,
      status: handoff.status,
      priority: handoff.priority,
      createdAt: handoff.createdAt,
      updatedAt: handoff.updatedAt ?? handoff.createdAt,
      claimedAt: handoff.claimedAt,
      completedAt: handoff.completedAt,
      claimedBy: handoff.claimedBy ?? null,
      payload: JSON.stringify(handoff.payload),
      artifacts: JSON.stringify(handoff.artifacts),
      messages: JSON.stringify(handoff.messages)
    });
  }

  #insertOrReplaceThread(thread, replace = true) {
    const statement = this.db.prepare(`
      INSERT OR ${replace ? "REPLACE" : "ABORT"} INTO threads (
        id, channel, source_agent, target_agent, title, status,
        created_at, updated_at, handoff_ids_json, messages_json
      ) VALUES (
        $id, $channel, $sourceAgent, $targetAgent, $title, $status,
        $createdAt, $updatedAt, $handoffIds, $messages
      )
    `);

    statement.run({
      id: thread.id,
      channel: thread.channel,
      sourceAgent: thread.sourceAgent,
      targetAgent: thread.targetAgent,
      title: thread.title,
      status: thread.status,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt ?? thread.createdAt,
      handoffIds: JSON.stringify(thread.handoffIds ?? []),
      messages: JSON.stringify(thread.messages ?? [])
    });
  }

  #touchLinkedThread(handoff) {
    if (!handoff?.threadId) {
      return;
    }

    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(handoff.threadId);
    const thread = rowToThread(row);
    if (!thread) {
      return;
    }

    touchThreadFromHandoff(thread, handoff);
    this.#insertOrReplaceThread(thread, true);
  }

  #appendThreadMessageToLinkedThread(handoff, message) {
    if (!handoff?.threadId || !message) {
      return;
    }

    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(handoff.threadId);
    const thread = rowToThread(row);
    if (!thread) {
      return;
    }

    appendThreadMessageFromHandoff(thread, message);
    this.#insertOrReplaceThread(thread, true);
  }
}

export function createHandoffStore(options = {}) {
  const backend = options.backend ?? process.env.STORE_BACKEND ?? "json";
  const filePath = options.filePath ?? (
    backend === "sqlite"
      ? path.resolve("data/handoffs.sqlite")
      : path.resolve("data/handoffs.json")
  );

  if (backend === "sqlite") {
    return new SqliteHandoffStore(filePath);
  }

  return new JsonHandoffStore(filePath);
}
