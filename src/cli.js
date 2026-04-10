import { promises as fs } from "node:fs";
import path from "node:path";
import { JsonHandoffStore, createHandoffStore } from "./store.js";
import { JsonDevlogStore } from "./devlog-store.js";
import { JsonChannelProjectionStore } from "./channel-store.js";
import { buildConversationSnapshot, buildMailboxSnapshot } from "./mailbox.js";
import { toDevlogCard } from "./devlog.js";
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

function usage() {
  console.log(`
xlink CLI

Usage:
  node src/cli.js list [--status pending] [--channel devlog]
  node src/cli.js get <id>
  node src/cli.js mailbox [--agent <name>] [--after <iso>] [--status pending,claimed]
  node src/cli.js conversation <id>
  node src/cli.js preview-devlog <id>
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

    case "mailbox": {
      const handoffs = await handoffStore.list({
        status: flags.status,
        channel: flags.channel,
        priority: flags.priority,
        targetAgent: flags.targetAgent,
        sourceAgent: flags.sourceAgent,
        updatedSince: flags.after
      });
      printJson({
        ...buildMailboxSnapshot(handoffs, {
          agent: flags.agent,
          channel: flags.channel,
          status: flags.status,
          statuses: flags.status ? [flags.status] : [],
          after: flags.after,
          includeClosed: flags["include-closed"] === true || flags.includeClosed === true
        })
      });
      return;
    }

    case "conversation": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      printJson(buildConversationSnapshot(handoff));
      return;
    }

    case "preview-devlog": {
      const id = positionals[0];
      const handoff = await handoffStore.getById(id);
      const card = toDevlogCard(handoff);
      printJson({ card });
      return;
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

      await handoffStore.claim(handoff.id, {
        agent: syncAgent,
        note: flags.note ?? "devlog sync started"
      });
      const completed = await handoffStore.complete(handoff.id, {
        agent: syncAgent,
        result: flags.result ?? "devlog card ingested and handoff completed"
      });
      const card = toDevlogCard(completed);
      const ingest = await devlogStore.ingest(card);

      printJson({
        handoff: completed,
        ingest
      });
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
      let handoff = await handoffStore.getById(id);

      if (handoff.status === "pending") {
        handoff = await handoffStore.claim(id, {
          agent: flags.agent,
          note: flags.note ?? "devlog sync started"
        });
      }

      const card = toDevlogCard(handoff);
      const ingest = await devlogStore.ingest(card);
      const completed = await handoffStore.complete(id, {
        agent: flags.agent,
        result: flags.result ?? "devlog card ingested and handoff completed"
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
