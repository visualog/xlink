import { promises as fs } from "node:fs";
import path from "node:path";
import { JsonHandoffStore, createHandoffStore } from "./store.js";
import { JsonDevlogStore } from "./devlog-store.js";
import { JsonChannelProjectionStore } from "./channel-store.js";
import { buildConversationSnapshot, buildMailboxSnapshot, buildThreadInbox } from "./mailbox.js";
import { toDevlogCard } from "./devlog.js";
import { syncDevlogHandoff, syncPendingDevlogHandoffs } from "./devlog-sync.js";
import { projectHandoff } from "./projections.js";

const STORE_BACKEND = process.env.STORE_BACKEND ?? "sqlite";
const HANDOFF_DATA_PATH = process.env.HANDOFF_DATA_PATH
  ? path.resolve(process.env.HANDOFF_DATA_PATH)
  : path.resolve(STORE_BACKEND === "sqlite" ? "data/handoffs.sqlite" : "data/handoffs.json");
const DEVLOG_DATA_PATH = process.env.DEVLOG_DATA_PATH
  ? path.resolve(process.env.DEVLOG_DATA_PATH)
  : path.resolve("../xlog/data/devlogs.json");
const CHANNEL_DATA_DIR = process.env.CHANNEL_DATA_DIR
  ? path.resolve(process.env.CHANNEL_DATA_DIR)
  : path.resolve("data/channels");

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseInterval(value, fallback = 2000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(250, Math.trunc(parsed));
}

function parseFlags(args) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { flags, positionals };
}

function trimOptionalFlag(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function getOptionalFlag(flags, ...keys) {
  for (const key of keys) {
    const value = trimOptionalFlag(flags[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function isEnabledFlag(value) {
  return value === true || value === "true";
}

function shouldIncludeThreadSummaries(flags) {
  return isEnabledFlag(flags["include-read-state"]) || isEnabledFlag(flags.includeReadState) || Boolean(getOptionalFlag(flags, "agent"));
}

function getThreadRouteFiltersForCli(flags, threadId) {
  return {
    threadId,
    status: getOptionalFlag(flags, "status"),
    channel: getOptionalFlag(flags, "channel"),
    targetAgent: getOptionalFlag(flags, "target-agent", "targetAgent"),
    sourceAgent: getOptionalFlag(flags, "source-agent", "sourceAgent"),
    updatedSince: getOptionalFlag(flags, "after")
  };
}

function getHandoffFiltersForThreadCli(flags, threadId) {
  return {
    threadId,
    channel: getOptionalFlag(flags, "channel"),
    targetAgent: getOptionalFlag(flags, "target-agent", "targetAgent"),
    sourceAgent: getOptionalFlag(flags, "source-agent", "sourceAgent"),
    updatedSince: getOptionalFlag(flags, "after")
  };
}

function filterMailboxCollectionsByThread(collections, threadId) {
  const normalizedThreadId = trimOptionalFlag(threadId);
  if (!normalizedThreadId) {
    return collections;
  }

  return {
    handoffs: collections.handoffs.filter((handoff) => handoff.threadId === normalizedThreadId),
    threads: collections.threads.filter((thread) => thread.id === normalizedThreadId)
  };
}

function usage() {
  console.log(`
xlink CLI

Usage:
  node src/cli.js list [--status pending] [--channel devlog]
  node src/cli.js get <id>
  node src/cli.js list-threads [--status open] [--channel bridge] [--target-agent <name>] [--source-agent <name>] [--after <iso>] [--agent <name>] [--include-read-state]
  node src/cli.js get-thread <id> [--agent <name>] [--include-read-state]
  node src/cli.js thread-messages <id>
  node src/cli.js append-thread-message <id> --author <name> --body "..." [--kind note]
  node src/cli.js create-thread-handoff <id> --input ./payload.json [--channel bridge] [--source-agent <name>] [--target-agent <name>] [--title "..."] [--priority medium]
  node src/cli.js mailbox [--agent <name>] [--after <iso>] [--status pending,claimed]
  node src/cli.js mailbox-unread --agent <name> [--channel bridge] [--thread <threadId>]
  node src/cli.js ack-mailbox --agent <name> [--cursor <iso>] [--thread <threadId>]
  node src/cli.js watch-mailbox [--agent <name>] [--after <iso>] [--interval 2000] [--once]
  node src/cli.js conversation <id>
  node src/cli.js watch-conversation <id> [--after <iso>] [--interval 2000] [--once]
  node src/cli.js preview-devlog <id>
  node src/cli.js sync-pending-devlogs --agent <name> [--limit 20] [--note "..."] [--result "..."]
  node src/cli.js validate-xbridge-compose <id> [--base-url http://127.0.0.1:3850] [--xbridge-base-url http://127.0.0.1:3846] [--no-record] [--auto-block]
  node src/cli.js record-devlog --input ./payload.json [--source-agent bridge-agent] [--target-agent devlog-agent] [--priority medium] [--handoff-title "..."] [--sync-agent devlog-agent]
  node src/cli.js preview-projection <id> [--channel docs]
  node src/cli.js import-json [--source data/handoffs.json] [--target data/handoffs.sqlite] [--target-backend sqlite] [--skip-existing]
  node src/cli.js export-json [--source data/handoffs.sqlite] [--source-backend sqlite] [--target data/handoffs.export.json] [--skip-existing]
  node src/cli.js ingest-channel <id> --channel docs
  node src/cli.js sync-channel <id> --channel review --agent review-agent [--note "..."] [--result "..."]
  node src/cli.js claim <id> --agent <name> [--note "..."]
  node src/cli.js complete <id> --agent <name> --result "..."
  node src/cli.js block <id> --agent <name> --reason "..."
  node src/cli.js reject <id> --agent <name> --reason "..."
  node src/cli.js add-artifact <id> --type thumbnail --path ./assets/ui/example.png [--label "..."]
  node src/cli.js append-message <id> --author <name> --body "..." [--kind note]
  node src/cli.js reply <id> --author <name> --body "..." [--kind reply]
  node src/cli.js ingest-devlog <id>
  node src/cli.js sync-devlog <id> --agent <name> [--note "..."] [--result "..."]
`);
}

async function readPayloadFile(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return JSON.parse(raw);
}

async function loadStores() {
  const handoffStore = createHandoffStore({
    backend: STORE_BACKEND,
    filePath: HANDOFF_DATA_PATH
  });
  const devlogStore = new JsonDevlogStore(DEVLOG_DATA_PATH);
  await handoffStore.initialize();
  await devlogStore.initialize();
  return { handoffStore, devlogStore };
}

async function buildMailboxSnapshotForCli(handoffStore, flags, cursor) {
  const threadId = trimOptionalFlag(flags.thread);
  const [handoffs, threads, readState, readStates] = await Promise.all([
    handoffStore.list({
      status: flags.status,
      threadId,
      channel: flags.channel,
      priority: flags.priority,
      targetAgent: flags.targetAgent,
      sourceAgent: flags.sourceAgent,
      updatedSince: cursor
    }),
    handoffStore.listThreads({
      threadId,
      channel: flags.channel,
      targetAgent: flags.targetAgent,
      sourceAgent: flags.sourceAgent,
      updatedSince: cursor
    }),
    flags.agent ? handoffStore.getMailboxReadState(flags.agent, { threadId }) : Promise.resolve(null),
    flags.agent && typeof handoffStore.listMailboxReadStates === "function"
      ? handoffStore.listMailboxReadStates(flags.agent)
      : Promise.resolve([])
  ]);
  const collections = filterMailboxCollectionsByThread({ handoffs, threads }, threadId);
  const readStateByThread = Object.fromEntries(
    (readStates ?? [])
      .filter((item) => item?.threadId)
      .map((item) => [item.threadId, item.lastReadAt ?? null])
  );

  return buildMailboxSnapshot(collections, {
    status: flags.status,
    channel: flags.channel,
    targetAgent: flags.targetAgent,
    sourceAgent: flags.sourceAgent,
    agent: flags.agent,
    threadId,
    statuses: flags.status ? [flags.status] : [],
    after: cursor,
    includeClosed: flags["include-closed"] === true || flags.includeClosed === true,
    lastReadAt: readState?.globalLastReadAt ?? readState?.lastReadAt ?? null,
    readStateByThread
  });
}

async function buildThreadSummariesForCli(handoffStore, flags, threadId) {
  const agent = getOptionalFlag(flags, "agent");
  const [threads, handoffs, readState, readStates] = await Promise.all([
    handoffStore.listThreads(getThreadRouteFiltersForCli(flags, threadId)),
    handoffStore.list(getHandoffFiltersForThreadCli(flags, threadId)),
    agent ? handoffStore.getMailboxReadState(agent, { threadId }) : Promise.resolve(null),
    agent && typeof handoffStore.listMailboxReadStates === "function"
      ? handoffStore.listMailboxReadStates(agent)
      : Promise.resolve([])
  ]);
  const readStateByThread = Object.fromEntries(
    (readStates ?? [])
      .filter((item) => item?.threadId)
      .map((item) => [item.threadId, item.lastReadAt ?? null])
  );
  const summaries = buildThreadInbox(threads, handoffs, {
    agent,
    threadId,
    status: getOptionalFlag(flags, "status"),
    channel: getOptionalFlag(flags, "channel"),
    targetAgent: getOptionalFlag(flags, "target-agent", "targetAgent"),
    sourceAgent: getOptionalFlag(flags, "source-agent", "sourceAgent"),
    after: getOptionalFlag(flags, "after"),
    lastReadAt: readState?.globalLastReadAt ?? readState?.lastReadAt ?? null,
    readStateByThread
  });

  return {
    summaries,
    mailbox: {
      agent,
      threadId: threadId ?? null,
      unreadCount: summaries.filter((item) => item.unread).length,
      total: summaries.length
    },
    readState: readState ?? null
  };
}

async function loadChannelProjectionStore(channel) {
  const store = new JsonChannelProjectionStore(path.resolve(CHANNEL_DATA_DIR, `${channel}.json`), channel);
  await store.initialize();
  return store;
}

async function importJsonCommand(flags) {
  const sourcePath = path.resolve(flags.source ?? "data/handoffs.json");
  const targetBackend = flags["target-backend"] ?? "sqlite";
  const targetPath = path.resolve(
    flags.target ?? (targetBackend === "sqlite" ? "data/handoffs.sqlite" : "data/handoffs.imported.json")
  );

  const sourceStore = new JsonHandoffStore(sourcePath);
  const targetStore = createHandoffStore({
    backend: targetBackend,
    filePath: targetPath
  });

  await sourceStore.initialize();
  await targetStore.initialize();

  const handoffs = await sourceStore.list();
  const existingIds = new Set((await targetStore.list()).map((handoff) => handoff.id));
  let imported = 0;
  let skipped = 0;

  for (const handoff of handoffs) {
    try {
      if (flags["skip-existing"] && existingIds.has(handoff.id)) {
        skipped += 1;
        continue;
      }

      await targetStore.upsertSnapshot(handoff);
      existingIds.add(handoff.id);
      imported += 1;
    } catch (error) {
      if (String(error.message).includes("already exists")) {
        skipped += 1;
        continue;
      }

      throw error;
    }
  }

  printJson({
    sourcePath,
    targetBackend,
    targetPath,
    total: handoffs.length,
    imported,
    skipped
  });
}

async function exportJsonCommand(flags) {
  const sourceBackend = flags["source-backend"] ?? STORE_BACKEND;
  const sourcePath = path.resolve(
    flags.source ?? (sourceBackend === "sqlite" ? "data/handoffs.sqlite" : "data/handoffs.json")
  );
  const targetPath = path.resolve(flags.target ?? "data/handoffs.export.json");

  const sourceStore = createHandoffStore({
    backend: sourceBackend,
    filePath: sourcePath
  });
  const targetStore = new JsonHandoffStore(targetPath);

  await sourceStore.initialize();
  await targetStore.initialize();

  const handoffs = await sourceStore.list();
  const existingIds = new Set((await targetStore.list()).map((handoff) => handoff.id));
  let exported = 0;
  let skipped = 0;

  for (const handoff of handoffs) {
    if (flags["skip-existing"] && existingIds.has(handoff.id)) {
      skipped += 1;
      continue;
    }

    await targetStore.upsertSnapshot(handoff);
    existingIds.add(handoff.id);
    exported += 1;
  }

  printJson({
    sourceBackend,
    sourcePath,
    targetPath,
    total: handoffs.length,
    exported,
    skipped
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  const { flags, positionals } = parseFlags(rest);
  const { handoffStore, devlogStore } = await loadStores();

  switch (command) {
    case "list": {
      const handoffs = await handoffStore.list({
        status: flags.status,
        channel: flags.channel,
        priority: flags.priority,
        targetAgent: flags.targetAgent,
        sourceAgent: flags.sourceAgent
      });
      printJson({ handoffs });
      return;
    }

    case "get": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      printJson({ handoff });
      return;
    }

    case "list-threads": {
      const threads = await handoffStore.listThreads(getThreadRouteFiltersForCli(flags));
      const payload = { threads };

      if (shouldIncludeThreadSummaries(flags)) {
        const { summaries, mailbox } = await buildThreadSummariesForCli(handoffStore, flags);
        payload.summaries = summaries;
        payload.mailbox = mailbox;
      }

      printJson(payload);
      return;
    }

    case "get-thread": {
      const id = positionals[0];
      const thread = await handoffStore.getThreadById(id);
      const payload = { thread };

      if (shouldIncludeThreadSummaries(flags)) {
        const { summaries, readState } = await buildThreadSummariesForCli(handoffStore, flags, id);
        payload.summary = summaries[0] ?? null;
        payload.readState = readState;
      }

      printJson(payload);
      return;
    }

    case "thread-messages": {
      const id = positionals[0];
      const thread = await handoffStore.getThreadById(id);
      printJson({
        thread,
        messages: Array.isArray(thread.messages) ? thread.messages : []
      });
      return;
    }

    case "append-thread-message": {
      const id = positionals[0];
      const thread = await handoffStore.appendThreadMessage(id, {
        author: flags.author,
        body: flags.body,
        kind: flags.kind
      });
      printJson({ thread });
      return;
    }

    case "create-thread-handoff": {
      const id = positionals[0];
      const payloadPath = flags.input ?? flags.payload;
      if (!payloadPath) {
        throw new Error("create-thread-handoff requires --input <payload.json>");
      }

      const payload = await readPayloadFile(payloadPath);
      const result = await handoffStore.createThreadHandoff(id, {
        payload,
        channel: flags.channel,
        sourceAgent: flags["source-agent"],
        targetAgent: flags["target-agent"],
        title: flags.title,
        priority: flags.priority
      });
      printJson(result);
      return;
    }

    case "mailbox": {
      printJson(await buildMailboxSnapshotForCli(handoffStore, flags, flags.after));
      return;
    }

    case "mailbox-unread": {
      const threadId = trimOptionalFlag(flags.thread);
      const readState = await handoffStore.getMailboxReadState(flags.agent, { threadId });
      const snapshot = await buildMailboxSnapshotForCli(handoffStore, flags, undefined);
      printJson({
        agent: flags.agent,
        threadId,
        lastReadAt: readState.lastReadAt,
        unreadCount: snapshot.mailbox.unreadCount ?? 0,
        threadIds: snapshot.threads.filter((item) => item.unread).map((item) => item.id),
        handoffIds: Array.from(
          new Set(
            snapshot.threads
              .filter((item) => item.unread)
              .flatMap((item) => (Array.isArray(item.handoffIds) ? item.handoffIds : []))
          )
        )
      });
      return;
    }

    case "ack-mailbox": {
      const threadId = trimOptionalFlag(flags.thread);
      const ack = await handoffStore.ackMailbox(flags.agent, { cursor: flags.cursor, threadId });
      const snapshot = await buildMailboxSnapshotForCli(handoffStore, flags, undefined);
      printJson({
        ack,
        unreadCount: snapshot.mailbox.unreadCount ?? 0,
        threadId: ack.threadId ?? null
      });
      return;
    }

    case "conversation": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      printJson(buildConversationSnapshot(handoff));
      return;
    }

    case "watch-mailbox": {
      const interval = parseInterval(flags.interval, 2000);
      let cursor = flags.after;

      while (true) {
        const snapshot = await buildMailboxSnapshotForCli(handoffStore, flags, cursor);

        if (snapshot.threads.length > 0 || snapshot.handoffs.length > 0) {
          printJson(snapshot);
          cursor = snapshot.mailbox.nextAfter ?? cursor;
        }

        if (flags.once === true) {
          return;
        }

        await sleep(interval);
      }
    }

    case "preview-devlog": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      const card = toDevlogCard(handoff);
      printJson({ card });
      return;
    }

    case "watch-conversation": {
      const id = positionals[0];
      const interval = parseInterval(flags.interval, 2000);
      let cursor = flags.after;

      while (true) {
        const handoff = await handoffStore.getById(id);
        const snapshot = buildConversationSnapshot(handoff, { after: cursor });

        if (snapshot.delta.hasChanges) {
          printJson(snapshot);
          cursor = snapshot.delta.nextAfter ?? cursor;
        }

        if (flags.once === true) {
          return;
        }

        await sleep(interval);
      }
    }

    case "validate-xbridge-compose": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      const response = await fetch(
        `${flags["base-url"] ?? "http://127.0.0.1:3850"}/handoffs/${id}/xbridge-validate`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            baseUrl: flags["xbridge-base-url"] ?? flags["bridge-base-url"],
            recordMessage: !(flags["no-record"] === true || flags.noRecord === true),
            autoBlockOnFailure: flags["auto-block"] === true || flags.autoBlock === true,
            author: flags.author,
            note: flags.note,
            payload: flags["use-inline-payload"] ? handoff.payload : undefined
          })
        }
      );

      const result = await response.json();
      if (!response.ok || result?.error) {
        throw new Error(result?.error ?? `xbridge validation failed with status ${response.status}`);
      }

      printJson(result);
      return;
    }

    case "record-devlog": {
      const payloadPath = flags.input ?? flags.payload;
      if (!payloadPath) {
        throw new Error("record-devlog requires --input <payload.json>");
      }

      const payload = await readPayloadFile(payloadPath);
      const sourceAgent = flags["source-agent"] ?? "main-agent";
      const targetAgent = flags["target-agent"] ?? "devlog-agent";
      const syncAgent = flags["sync-agent"] ?? targetAgent;
      const handoffTitle = flags["handoff-title"] ?? payload.title;
      const handoff = await handoffStore.create({
        channel: "devlog",
        targetAgent,
        sourceAgent,
        title: handoffTitle,
        priority: flags.priority ?? "medium",
        payload
      });

      const { handoff: completed, ingest } = await syncDevlogHandoff(handoffStore, devlogStore, handoff, {
        agent: syncAgent,
        note: flags.note,
        result: flags.result
      });

      printJson({
        handoff: completed,
        ingest
      });
      return;
    }

    case "sync-pending-devlogs": {
      const summary = await syncPendingDevlogHandoffs(handoffStore, devlogStore, {
        agent: flags.agent,
        limit: flags.limit,
        note: flags.note,
        result: flags.result
      });
      printJson(summary);
      return;
    }

    case "preview-projection": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      const projection = projectHandoff(handoff, flags.channel ?? handoff.channel);
      printJson({ projection });
      return;
    }

    case "import-json": {
      await importJsonCommand(flags);
      return;
    }

    case "export-json": {
      await exportJsonCommand(flags);
      return;
    }

    case "claim": {
      const id = positionals[0];
      const handoff = await handoffStore.claim(id, {
        agent: flags.agent,
        note: flags.note
      });
      printJson({ handoff });
      return;
    }

    case "complete": {
      const id = positionals[0];
      const handoff = await handoffStore.complete(id, {
        agent: flags.agent,
        result: flags.result
      });
      printJson({ handoff });
      return;
    }

    case "block": {
      const id = positionals[0];
      const handoff = await handoffStore.block(id, {
        agent: flags.agent,
        reason: flags.reason
      });
      printJson({ handoff });
      return;
    }

    case "reject": {
      const id = positionals[0];
      const handoff = await handoffStore.reject(id, {
        agent: flags.agent,
        reason: flags.reason
      });
      printJson({ handoff });
      return;
    }

    case "add-artifact": {
      const id = positionals[0];
      const handoff = await handoffStore.addArtifact(id, {
        type: flags.type,
        path: flags.path,
        label: flags.label
      });
      printJson({ handoff });
      return;
    }

    case "append-message": {
      const id = positionals[0];
      const handoff = await handoffStore.appendMessage(id, {
        author: flags.author,
        body: flags.body,
        kind: flags.kind
      });
      printJson({ handoff });
      return;
    }

    case "reply": {
      const id = positionals[0];
      const handoff = await handoffStore.appendMessage(id, {
        author: flags.author,
        body: flags.body,
        kind: flags.kind ?? "reply"
      });
      printJson({ handoff });
      return;
    }

    case "ingest-devlog": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      const card = toDevlogCard(handoff);
      const result = await devlogStore.ingest(card);
      printJson(result);
      return;
    }

    case "sync-devlog": {
      const id = positionals[0];
      const { handoff: completed, ingest } = await syncDevlogHandoff(handoffStore, devlogStore, id, {
        agent: flags.agent,
        note: flags.note,
        result: flags.result
      });

      printJson({
        handoff: completed,
        ingest
      });
      return;
    }

    case "ingest-channel": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      const channel = flags.channel ?? handoff.channel;
      const projection = projectHandoff(handoff, channel);
      const store = await loadChannelProjectionStore(channel);
      const result = await store.ingest(projection);
      printJson(result);
      return;
    }

    case "sync-channel": {
      const id = positionals[0];
      let handoff = await handoffStore.getById(id);
      const channel = flags.channel ?? handoff.channel;

      if (handoff.status === "pending") {
        handoff = await handoffStore.claim(id, {
          agent: flags.agent,
          note: flags.note ?? `${channel} sync started`
        });
      }

      const projection = projectHandoff(handoff, channel);
      const store = await loadChannelProjectionStore(channel);
      const ingest = await store.ingest(projection);
      const completed = await handoffStore.complete(id, {
        agent: flags.agent,
        result: flags.result ?? `${channel} projection ingested and handoff completed`
      });

      printJson({
        handoff: completed,
        ingest
      });
      return;
    }

    default:
      usage();
      process.exitCode = 1;
    }
  }

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
