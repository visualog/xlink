import { json, readJsonBody } from "../http.js";
import { buildConversationSnapshot } from "../mailbox.js";
import { toDevlogCard } from "../devlog.js";
import { projectHandoff } from "../projections.js";
import { validateXbridgeComposePayload } from "../xbridge-validator.js";

export function createHandoffRoutes(store, options = {}) {
  const devlogStore = options.devlogStore ?? null;
  const projectionStores = options.projectionStores ?? new Map();

  return async function handleHandoffRoute(request, response, url, pathParts) {
    if (request.method === "GET" && url.pathname === "/handoffs") {
      const handoffs = await store.list({
        status: url.searchParams.get("status") ?? undefined,
        channel: url.searchParams.get("channel") ?? undefined,
        priority: url.searchParams.get("priority") ?? undefined,
        targetAgent: url.searchParams.get("targetAgent") ?? undefined,
        sourceAgent: url.searchParams.get("sourceAgent") ?? undefined
      });

      json(response, 200, { handoffs });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/handoffs") {
      const body = await readJsonBody(request);
      const handoff = await store.create(body);
      json(response, 201, { handoff });
      return true;
    }

    if (pathParts[0] !== "handoffs" || pathParts.length < 2) {
      return false;
    }

    const id = pathParts[1];

    if (request.method === "GET" && pathParts.length === 2) {
      const handoff = await store.getById(id);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "GET" && pathParts[2] === "conversation") {
      const handoff = await store.getById(id);
      const snapshot = buildConversationSnapshot(handoff);
      json(response, 200, snapshot);
      return true;
    }

    if (request.method === "GET" && pathParts[2] === "projection") {
      const handoff = await store.getById(id);
      const projection = projectHandoff(handoff, url.searchParams.get("channel") ?? handoff.channel);
      json(response, 200, { projection });
      return true;
    }

    if (request.method === "GET" && pathParts[2] === "devlog-card") {
      const handoff = await store.getById(id);
      const card = toDevlogCard(handoff);
      json(response, 200, { card });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "devlog-ingest") {
      if (!devlogStore) {
        json(response, 501, { error: "Devlog ingest store is not configured." });
        return true;
      }

      const handoff = await store.getById(id);
      const card = toDevlogCard(handoff);
      const result = await devlogStore.ingest(card);
      json(response, 200, result);
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "devlog-sync") {
      if (!devlogStore) {
        json(response, 501, { error: "Devlog ingest store is not configured." });
        return true;
      }

      const body = await readJsonBody(request);
      const agent = body.agent;
      const note = body.note ?? "devlog sync started";
      const resultMessage = body.result ?? "devlog card ingested and handoff completed";

      let handoff = await store.getById(id);

      if (handoff.status === "pending") {
        handoff = await store.claim(id, { agent, note });
      }

      const completed = await store.complete(id, { agent, result: resultMessage });
      const card = toDevlogCard(completed);
      const ingestResult = await devlogStore.ingest(card);

      json(response, 200, {
        handoff: completed,
        ingest: ingestResult
      });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "channel-ingest") {
      const body = await readJsonBody(request);
      const channel = body.channel ?? url.searchParams.get("channel");
      const projectionStore = projectionStores.get(channel);

      if (!projectionStore) {
        json(response, 501, { error: `Projection ingest store is not configured for channel ${channel}.` });
        return true;
      }

      const handoff = await store.getById(id);
      const projection = projectHandoff(handoff, channel);
      const result = await projectionStore.ingest(projection);
      json(response, 200, result);
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "channel-sync") {
      const body = await readJsonBody(request);
      const channel = body.channel ?? url.searchParams.get("channel");
      const agent = body.agent;
      const note = body.note ?? `${channel} sync started`;
      const resultMessage = body.result ?? `${channel} projection ingested and handoff completed`;
      const projectionStore = projectionStores.get(channel);

      if (!projectionStore) {
        json(response, 501, { error: `Projection ingest store is not configured for channel ${channel}.` });
        return true;
      }

      let handoff = await store.getById(id);

      if (handoff.status === "pending") {
        handoff = await store.claim(id, { agent, note });
      }

      const projection = projectHandoff(handoff, channel);
      const ingest = await projectionStore.ingest(projection);
      const completed = await store.complete(id, { agent, result: resultMessage });

      json(response, 200, {
        handoff: completed,
        ingest
      });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "xbridge-validate") {
      const body = await readJsonBody(request);
      const handoff = await store.getById(id);
      const payload = body.payload ?? handoff.payload ?? {};
      const validationResult = await validateXbridgeComposePayload(payload, {
        baseUrl: body.baseUrl
      });

      let updatedHandoff = handoff;
      if (body.recordMessage !== false) {
        updatedHandoff = await store.appendMessage(id, {
          author: body.author ?? "bridge-agent",
          body: body.note ?? validationResult.summary,
          kind: body.kind ?? "note"
        });
      }

      const shouldAutoBlock = body.autoBlockOnFailure === true;
      if (shouldAutoBlock && validationResult.validation?.canCompose === false) {
        updatedHandoff = await store.block(id, {
          agent: body.author ?? "bridge-agent",
          reason:
            body.blockReason ??
            "xbridge compose validation failed: handoff moved to blocked for follow-up."
        });
      }

      json(response, 200, {
        handoff: updatedHandoff,
        validation: validationResult
      });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "claim") {
      const body = await readJsonBody(request);
      const handoff = await store.claim(id, body);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "complete") {
      const body = await readJsonBody(request);
      const handoff = await store.complete(id, body);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "block") {
      const body = await readJsonBody(request);
      const handoff = await store.block(id, body);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "reject") {
      const body = await readJsonBody(request);
      const handoff = await store.reject(id, body);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "artifacts") {
      const body = await readJsonBody(request);
      const handoff = await store.addArtifact(id, body);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "messages") {
      const body = await readJsonBody(request);
      const handoff = await store.appendMessage(id, body);
      json(response, 200, { handoff });
      return true;
    }

    if (request.method === "POST" && pathParts[2] === "reply") {
      const body = await readJsonBody(request);
      const handoff = await store.appendMessage(id, {
        author: body.author,
        body: body.body,
        kind: body.kind ?? "reply"
      });
      json(response, 200, { handoff });
      return true;
    }

    return false;
  };
}
