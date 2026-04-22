import { json, readJsonBody } from "../http.js";
import { buildReviewContext } from "../review-context.js";
import { StoreError } from "../store.js";

function pickActiveReviewHandoff(handoffs = []) {
  const priority = ["claimed", "pending", "blocked", "rejected", "completed"];

  for (const status of priority) {
    const found = handoffs.find((handoff) => handoff.status === status);
    if (found) {
      return found;
    }
  }

  return handoffs[0] ?? null;
}

async function resolvePrimaryReviewHandoff(store, threadId) {
  const handoffs = await store.list({ threadId, channel: "review" });
  const handoff = pickActiveReviewHandoff(handoffs);

  if (!handoff) {
    throw new StoreError(404, `thread ${threadId} does not have any linked review handoffs.`);
  }

  return handoff;
}

function buildReviewDecisionMessage(body = {}) {
  if (typeof body.summary === "string" && body.summary.trim()) {
    return body.summary.trim();
  }

  const decision = String(body.decision || "").trim();
  const parts = decision ? [`review ${decision}`] : [];

  if (typeof body.note === "string" && body.note.trim()) {
    parts.push(body.note.trim());
  }

  return parts.join(" · ") || "review decision updated";
}

function buildFollowupPayload(handoff, body, summaryMessage) {
  const payload = handoff?.payload ?? {};

  return {
    ...payload,
    type: body.followupType ?? "design-revision",
    title: body.followupTitle ?? payload.title ?? handoff?.title ?? "Design revision",
    summary: body.followupSummary ?? summaryMessage,
    details: Array.isArray(body.followupDetails) && body.followupDetails.length > 0
      ? body.followupDetails
      : []
        .concat(Array.isArray(payload.details) ? payload.details : [])
        .concat(typeof body.note === "string" && body.note.trim() ? [`review feedback: ${body.note.trim()}`] : [])
  };
}

export function createReviewRoutes(store, projectionStores = new Map()) {
  return async function handleReviewRoute(request, response, url) {
    if (request.method === "GET" && url.pathname === "/review/context") {
      const context = await buildReviewContext(store, projectionStores.get("review"), {
        agent: url.searchParams.get("agent") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        handoffLimit: url.searchParams.get("handoffLimit") ?? undefined,
        briefLimit: url.searchParams.get("briefLimit") ?? undefined,
        includeClosed: url.searchParams.get("includeClosed") === "true"
      });
      json(response, 200, { context });
      return true;
    }

    if (request.method === "POST" && url.pathname.startsWith("/review/threads/") && url.pathname.endsWith("/decision")) {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const id = pathParts[2];
      const body = await readJsonBody(request);
      const decision = String(body.decision || "").trim();
      const agent = body.agent ?? "review-agent";

      if (!["approved", "changes-requested", "blocked"].includes(decision)) {
        throw new StoreError(400, "review decision must be approved, changes-requested, or blocked.");
      }

      let handoff = await resolvePrimaryReviewHandoff(store, id);
      if (handoff.status === "pending" && body.claimIfPending !== false) {
        handoff = await store.claim(handoff.id, {
          agent,
          note: body.claimNote ?? "review started"
        });
      }

      const summaryMessage = buildReviewDecisionMessage(body);
      let followup = null;

      if (decision === "blocked") {
        handoff = await store.block(handoff.id, {
          agent,
          reason: body.reason ?? summaryMessage
        });
      } else {
        if (body.complete === false) {
          handoff = await store.appendMessage(handoff.id, {
            author: agent,
            body: summaryMessage,
            kind: body.kind ?? "review-decision"
          });
        } else {
          handoff = await store.complete(handoff.id, {
            agent,
            result: body.result ?? summaryMessage
          });
        }

        if (decision === "changes-requested" && body.createFollowup !== false) {
          followup = await store.createThreadHandoff(id, {
            channel: "figma",
            sourceAgent: body.sourceAgent ?? agent,
            targetAgent: body.targetAgent ?? handoff.sourceAgent ?? "designer-agent",
            priority: body.priority ?? handoff.priority,
            title: body.followupTitle ?? handoff.title,
            payload: buildFollowupPayload(handoff, body, summaryMessage)
          });

          for (const artifact of Array.isArray(handoff.artifacts) ? handoff.artifacts : []) {
            if (!artifact?.type || !artifact?.path) {
              continue;
            }
            const updatedFollowupHandoff = await store.addArtifact(followup.handoff.id, {
              type: artifact.type,
              path: artifact.path,
              label: artifact.label
            });
            followup.handoff = {
              ...followup.handoff,
              ...updatedFollowupHandoff,
              artifacts: updatedFollowupHandoff.artifacts ?? followup.handoff.artifacts
            };
          }
        }
      }

      const context = await buildReviewContext(store, projectionStores.get("review"), {
        agent,
        includeClosed: body.includeClosed === true
      });
      json(response, 200, {
        handoff,
        decision: {
          type: decision,
          summary: summaryMessage
        },
        followup,
        context
      });
      return true;
    }

    return false;
  };
}
