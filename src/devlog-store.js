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

function defaultDocument() {
  return {
    title: "All Devlogs",
    pillLabel: "XLink Working Notes",
    updatedAt: normalizeDateForIndex(),
    footerNote: "다음 단계: 카드 상세 강화, 파일/커밋 링크 연결, ingest automation 정리",
    entries: []
  };
}

export class JsonDevlogStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.#write(defaultDocument());
    }
  }

  async ingest(card) {
    if (!card || typeof card !== "object") {
      throw new StoreError(400, "card must be an object.");
    }

    if (typeof card.id !== "string" || !card.id.trim()) {
      throw new StoreError(400, "card.id must be a non-empty string.");
    }

    const state = await this.#read();
    const nextEntries = state.entries.filter((entry) => entry.id !== card.id);
    nextEntries.unshift(card);

    state.entries = nextEntries;
    state.updatedAt = normalizeDateForIndex();

    await this.#write(state);

    return {
      card,
      updatedAt: state.updatedAt,
      totalEntries: state.entries.length
    };
  }

  async #read() {
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.entries)) {
      throw new StoreError(500, "devlog store is malformed.");
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
