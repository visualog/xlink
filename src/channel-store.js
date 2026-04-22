import { promises as fs } from "node:fs";
import path from "node:path";
import { StoreError } from "./store.js";

function normalizeDateForIndex(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDocument(channel) {
  return {
    channel,
    updatedAt: normalizeDateForIndex(),
    entries: []
  };
}

export class JsonChannelProjectionStore {
  constructor(filePath, channel) {
    this.filePath = filePath;
    this.channel = channel;
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.#write(defaultDocument(this.channel));
    }
  }

  async ingest(entry) {
    if (!entry || typeof entry !== "object") {
      throw new StoreError(400, "projection entry must be an object.");
    }

    const key = entry.id ?? entry.data?.id;
    if (typeof key !== "string" || !key.trim()) {
      throw new StoreError(400, "projection entry must include an id.");
    }

    const state = await this.#read();
    const nextEntries = state.entries.filter((item) => {
      const currentKey = item.id ?? item.data?.id;
      return currentKey !== key;
    });

    nextEntries.unshift(entry);
    state.entries = nextEntries;
    state.updatedAt = normalizeDateForIndex();

    await this.#write(state);

    return {
      entry,
      updatedAt: state.updatedAt,
      totalEntries: state.entries.length
    };
  }

  async listEntries(input = {}) {
    const state = await this.#read();
    const ids = Array.isArray(input?.ids)
      ? new Set(
          input.ids
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        )
      : null;

    return {
      channel: state.channel ?? this.channel,
      updatedAt: state.updatedAt ?? null,
      entries: ids
        ? state.entries.filter((entry) => {
            const key = entry?.id ?? entry?.data?.id;
            const threadId = entry?.data?.threadId ?? null;
            return ids.has(key) || (threadId && ids.has(threadId));
          })
        : state.entries
    };
  }

  async getEntryById(id) {
    if (typeof id !== "string" || !id.trim()) {
      throw new StoreError(400, "projection entry id must be a non-empty string.");
    }

    const state = await this.#read();
    const entry = state.entries.find((item) => {
      const key = item?.id ?? item?.data?.id;
      return key === id;
    });

    if (!entry) {
      throw new StoreError(404, `projection entry ${id} was not found in channel ${this.channel}.`);
    }

    return {
      channel: state.channel ?? this.channel,
      updatedAt: state.updatedAt ?? null,
      entry
    };
  }

  async #read() {
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.entries)) {
      throw new StoreError(500, "channel projection store is malformed.");
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
