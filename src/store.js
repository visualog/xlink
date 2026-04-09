import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const VALID_STATUSES = new Set(["pending", "claimed", "completed", "rejected", "blocked"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const HANDOFF_CHANNELS = new Set(["devlog", "bridge", "figma", "docs", "review"]);

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

function normalizeMessage(message) {
  return {
    author: message.author,
    body: message.body,
    kind: message.kind ?? "note",
    createdAt: new Date().toISOString()
  };
}

function normalizeHandoffInput(input, existingIds = []) {
  assertObject(input, "body");
  assertString(input.channel, "channel");
  assertString(input.targetAgent, "targetAgent");
  assertString(input.sourceAgent, "sourceAgent");
  assertString(input.title, "title");
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
    payload: handoff.payload ?? {},
    artifacts: Array.isArray(handoff.artifacts) ? handoff.artifacts : [],
    messages: Array.isArray(handoff.messages) ? handoff.messages : []
  };
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
      await this.#write({ handoffs: [] });
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

  async create(input) {
    const state = await this.#read();
    const handoff = normalizeHandoffInput(input, state.handoffs.map((item) => item.id));

    if (state.handoffs.some((item) => item.id === handoff.id)) {
      throw new StoreError(409, `handoff ${handoff.id} already exists.`);
    }

    state.handoffs.push(handoff);
    await this.#write(state);
    return handoff;
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
      handoff.messages.push(this.#normalizeMessage({ author: input.agent, body: input.note }));
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
    handoff.messages.push(this.#normalizeMessage({ author: input.agent, body: input.result, kind: "result" }));

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
    handoff.messages.push(this.#normalizeMessage({ author: input.agent, body: input.reason, kind: "blocked" }));

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
    handoff.messages.push(this.#normalizeMessage({ author: input.agent, body: input.reason, kind: "rejected" }));

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

    handoff.messages.push(this.#normalizeMessage(input));
    handoff.updatedAt = new Date().toISOString();

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

    return parsed;
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
    payload: JSON.parse(row.payload_json),
    artifacts: JSON.parse(row.artifacts_json),
    messages: JSON.parse(row.messages_json)
  };
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

    const columns = this.db.prepare("PRAGMA table_info(handoffs)").all();
    const hasUpdatedAt = columns.some((column) => column.name === "updated_at");

    if (!hasUpdatedAt) {
      this.db.exec("ALTER TABLE handoffs ADD COLUMN updated_at TEXT;");
      this.db.exec("UPDATE handoffs SET updated_at = COALESCE(updated_at, created_at);");
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

  async create(input) {
    const ids = this.db.prepare("SELECT id FROM handoffs").all().map((row) => row.id);
    const handoff = normalizeHandoffInput(input, ids);

    try {
      this.#insertOrReplace(handoff, false);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new StoreError(409, `handoff ${handoff.id} already exists.`);
      }
      throw error;
    }

    return handoff;
  }

  async upsertSnapshot(handoff) {
    const snapshot = normalizeSnapshot(handoff);
    this.#insertOrReplace(snapshot, true);
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
      handoff.messages.push(normalizeMessage({ author: input.agent, body: input.note }));
    }

    this.#insertOrReplace(handoff, true);
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
    handoff.messages.push(normalizeMessage({ author: input.agent, body: input.result, kind: "result" }));
    this.#insertOrReplace(handoff, true);
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
    handoff.messages.push(normalizeMessage({ author: input.agent, body: input.reason, kind: "blocked" }));
    this.#insertOrReplace(handoff, true);
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
    handoff.messages.push(normalizeMessage({ author: input.agent, body: input.reason, kind: "rejected" }));
    this.#insertOrReplace(handoff, true);
    return handoff;
  }

  async addArtifact(id, input) {
    const handoff = await this.getById(id);
    handoff.artifacts.push(normalizeArtifact(input));
    handoff.updatedAt = new Date().toISOString();
    this.#insertOrReplace(handoff, true);
    return handoff;
  }

  async appendMessage(id, input) {
    assertObject(input, "body");
    assertString(input.author, "author");
    assertString(input.body, "body");
    optionalString(input.kind, "kind");

    const handoff = await this.getById(id);
    handoff.messages.push(normalizeMessage(input));
    handoff.updatedAt = new Date().toISOString();
    this.#insertOrReplace(handoff, true);
    return handoff;
  }

  #insertOrReplace(handoff, replace = true) {
    const statement = this.db.prepare(`
      INSERT OR ${replace ? "REPLACE" : "ABORT"} INTO handoffs (
        id, channel, target_agent, source_agent, title, status, priority,
        created_at, updated_at, claimed_at, completed_at, claimed_by,
        payload_json, artifacts_json, messages_json
      ) VALUES (
        $id, $channel, $targetAgent, $sourceAgent, $title, $status, $priority,
        $createdAt, $updatedAt, $claimedAt, $completedAt, $claimedBy,
        $payload, $artifacts, $messages
      )
    `);

    statement.run({
      id: handoff.id,
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
